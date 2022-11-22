import * as vscode from 'vscode';

interface DocumentNavigationState {
	/** Whether current state has potentially been invalidated, due to a document change. */
	needsUpdate: boolean;

  /** Cache for the symbol trees for the whole document. Lazily updated. */
	rootSymbols: vscode.DocumentSymbol[];

	/** A stack of ancestor symbols with the current symbol at the last (top) position. */
	lastSymbolAndAncestors: vscode.DocumentSymbol[];

	/** Position of the cursor on last update. */
	lastPosition: vscode.Position;

	/** Visible range on last update. */
	lastVisibleRange: vscode.Range;

	/** Whether the lastVisibleRange was invalidated within side-effects of a Navi Parens command. */
	leftVisibleRange: boolean;

	/** Cache to avoid UI interaction when extracting bracket scopes using jumpToBracket.
	 * Key: cursor position in the format `${p.line}/${p.character}` for initiating jumpToBracket.
	 * Value: resulting cursor position.
	 */
	jumpToBracketCache: Map<string, vscode.Position>;
}
let documentStates = new Map<vscode.Uri, DocumentNavigationState>();

let closingBrackets: string[] = [")", "]", "}", ">"];
let openingBrackets: string[] = ["(", "[", "{", "<"];
let closingBracketsRaw: string[] = [")", "]", "}"];
let openingBracketsRaw: string[] = ["(", "[", "{"];

/** From Navi Parens perspective, positions on the border of a scope are outside of the scope. */
function containsInside(range: vscode.Range, pos: vscode.Position): boolean {
	return range.contains(pos) && !range.start.isEqual(pos) && !range.end.isEqual(pos);
}

function strP(pos: vscode.Position): string {
	return `${pos.line},${pos.character}`;
}

/** Computes the resulting cursor position of `editor.action.jumpToBracket` from the given position.
 * Uses a global cache. Does not restore the selection state, to minimize the overall UI interactions.
 */
async function jumpToBracket(textEditor: vscode.TextEditor, pos: vscode.Position): Promise<vscode.Position> {
	const posStr = `${pos.line}/${pos.character}`;
	const uri = textEditor.document.uri;
	let state = documentStates.get(uri);
	if (!state) {
		// Being defensive: on actual code paths this should not happen.
		state = {
			needsUpdate: true, rootSymbols: [], lastSymbolAndAncestors: [], lastPosition: pos,
			lastVisibleRange: textEditor.visibleRanges.reduce((r1, r2) => r1.union(r2)),
			leftVisibleRange: false,
			jumpToBracketCache: new Map<string, vscode.Position>()
		};
		documentStates.set(uri, state);
	} else {
		let result = state.jumpToBracketCache.get(posStr);
		if (!!result) { return result; }
	}
	// Note: `textEditor.selection.active = pos;` didn't work.
	textEditor.selection = new vscode.Selection(pos, pos);
	await vscode.commands.executeCommand('editor.action.jumpToBracket');
	const result = textEditor.selection.active;
	if (!state.lastVisibleRange.contains(result)) {
		state.leftVisibleRange = true;
	}
	state.jumpToBracketCache.set(posStr, result);
	return result;
}

async function updateStateForPosition(textEditor: vscode.TextEditor): Promise<DocumentNavigationState> {
	const uri = textEditor.document.uri;
	const pos = textEditor.selection.active;
	let state = documentStates.get(uri);
	if (!state) {
		state = {
			needsUpdate: true, rootSymbols: [], lastSymbolAndAncestors: [], lastPosition: pos,
			lastVisibleRange: textEditor.visibleRanges.reduce((r1, r2) => r1.union(r2)),
			leftVisibleRange: false,
			jumpToBracketCache: new Map<string, vscode.Position>()
		};
		documentStates.set(uri, state);
	} else {
		state.lastVisibleRange = textEditor.visibleRanges.reduce((r1, r2) => r1.union(r2));
		state.leftVisibleRange = false;
	}
	if (state.needsUpdate) {
		const symbolSource = vscode.workspace.getConfiguration().get<string>("navi-parens.blockScopeMode");
		if (symbolSource === "Semantic") {
			state.rootSymbols = 
				await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
					'vscode.executeDocumentSymbolProvider', uri);			
		} else if (symbolSource === "None") {
			state.rootSymbols = [];
		} else {
			console.error('TODO: Not implemented yet.');
			state.rootSymbols = [];
		}
		if (state.rootSymbols === undefined) {
			console.error('vscode.executeDocumentSymbolProvider returned `undefined`');
			state.rootSymbols = [];
		}
		state.lastSymbolAndAncestors = [];
		state.jumpToBracketCache.clear();
		state.needsUpdate = false;
	} else if (pos.isEqual(state.lastPosition)) {
		return state;
	}

	// Locality bias: smaller position changes get processed quicker.
	let parentSymbol;
	while (!!(parentSymbol = state.lastSymbolAndAncestors.pop()) && !parentSymbol?.range.contains(pos)) {}	
	let children: vscode.DocumentSymbol[] = [];
	if (!parentSymbol || !parentSymbol.range.contains(pos)) {
		children = state.rootSymbols;
	} else {
		// The last `pop` should have been `peek` (`Array` does not implement `peek` anyway).
		state.lastSymbolAndAncestors.push(parentSymbol);
		children = parentSymbol.children;
	}
	// Iteratively pick the widest child containing the position, if any.
	while (children && children.length > 0) {
		let candidate: vscode.DocumentSymbol | null = null;
		for (const child of children) {
			if (containsInside(child.range, pos)) {
				if (!candidate) {
					candidate = child;
				} else if (child.range.contains(candidate.range)) {
					candidate = child;
				}
			}
		}
		if (!candidate) { break; }
		state.lastSymbolAndAncestors.push(candidate);
		children = candidate.children;
	}
	state.lastPosition = pos;
	return state;
}

function characterAtPoint(doc: vscode.TextDocument, pos: vscode.Position): string {
	return doc.getText(new vscode.Range(pos, pos.translate(0, 1)));
}

function nextPosition(doc: vscode.TextDocument, pos: vscode.Position) {
	let rightPos = doc.positionAt(doc.offsetAt(pos) + 1);
	if (rightPos.isEqual(pos)) {
		// In case endline is represented as two characters in the document.
		rightPos = doc.positionAt(doc.offsetAt(pos) + 2);
	}
	return rightPos;
}

function previousPosition(doc: vscode.TextDocument, pos: vscode.Position) {
	let leftPos = doc.positionAt(doc.offsetAt(pos) - 1);
	if (leftPos.isEqual(pos)) {
		console.assert(false, `previousPosition at ${strP(pos)} -- maybe endline glitch?`);
		leftPos = doc.positionAt(doc.offsetAt(pos) - 2);
	}
	return leftPos;
}

/** Returns the position outside of the outer scope bracket, opening if `before` is true otherwise closing.
 * If there is no outer scope, returns `null`.
 */
async function findOuterBracket(
		textEditor: vscode.TextEditor, before: boolean, pos: vscode.Position): Promise<vscode.Position | null> {
	const doc = textEditor.document;
	// TODO: optimize by passing in a search limit range, if any.
	// TODO: the rules do not handle multicharacter brackets.
	if (closingBrackets.includes(characterAtPoint(doc, pos))) {
		// Validate the result -- were we at an actual scope delimiter?
		let result = await jumpToBracket(textEditor, pos);
		if (closingBrackets.includes(characterAtPoint(doc, result))) {
			// No, the new bracket is the actual delimiter.
			if (before) {
				let jumpBack = await jumpToBracket(textEditor, result);
				if (jumpBack.isBefore(pos)) { return jumpBack; }
				else {
					console.assert(false, `editor.action.jumpToBracket skipped to ${strP(jumpBack)}` +
					  ' over its own opening delimiter.');
					return null;
				}
			} else {
				// The original bracket wasn't a real delimiter, but the new one is.
				return result.translate(0, 1);
			}
		} else if (openingBrackets.includes(characterAtPoint(doc, result))) {
			if (result.isBefore(pos)) {
				// The initial bracket is a real delimiter.
				if (before) { return result; }
				else { return pos.translate(0, 1); }
			} else {
				// Since we jumped to a scope opening to the right, we are outside of any scope.
				return null;
			}
		} else {
			console.assert(result.isEqual(pos),
				`editor.action.jumpToBracket jumped to a non-delimiter at ${strP(result)}.`);
			return null;
		}
	}
	if (pos.character === 0) {
		const endJump = await jumpToBracket(textEditor, pos);
		if (openingBrackets.includes(characterAtPoint(doc, pos))) {
			if (closingBrackets.includes(characterAtPoint(doc, endJump))) {
				// Check if `pos` is the corresponding delimiter.
				const backJump = await jumpToBracket(textEditor, endJump);
				if (backJump.isEqual(pos)) {
					// Skip over a subscope.
					return await findOuterBracket(textEditor, before, endJump.translate(0, 1));
				} else if (backJump.isBefore(pos)) {
					if (before) {	return backJump;}
					 else { return endJump.translate(0, 1); }
				} else {
					console.assert(false,
						`editor.action.jumpToBracket skipped over its own opening delimiter to ${strP(backJump)}.`);
					return null;
				}
			} else {
				// Either editor.action.jumpToBracket was no-op or jumped to a beginning scope.
				console.assert(endJump.isEqual(pos) || openingBrackets.includes(characterAtPoint(doc, endJump)), 
					`editor.action.jumpToBracket jumped to a non-delimiter at ${strP(endJump)}.`);
				return null;
			}
		} else {
			if (closingBrackets.includes(characterAtPoint(doc, endJump))) {
				if (before) {
					const backJump = await jumpToBracket(textEditor, endJump);
					if (backJump.isBefore(pos) && openingBrackets.includes(characterAtPoint(doc, backJump))) {
						return backJump;
					} else {
						console.assert(false,
							`editor.action.jumpToBracket skipped over its own opening delimiter to ${strP(backJump)}.`);
						return null;
					}
				} else {
					return endJump.translate(0, 1);
				}
			} else if (openingBrackets.includes(characterAtPoint(doc, endJump))) {
				if (endJump.isBefore(pos) && closingBrackets.includes(characterAtPoint(doc, pos))) {
					if (before) {
						return endJump;
					} else {
						return pos.translate(0, 1);
					}
				} else {
					console.assert(endJump.isAfter(pos),
						`editor.action.jumpToBracket jumped backward from non-delimiter to ${endJump}.`);
					return null;
				}
			}
		}
	}
	const leftPos = pos.translate(0, -1);
	if (openingBrackets.includes(characterAtPoint(doc, leftPos))) {
		// "((" or "(_" situation. "()" was excluded earlier.
		const endJump = await jumpToBracket(textEditor, leftPos);
		if (endJump.isEqual(leftPos) || openingBrackets.includes(characterAtPoint(doc, endJump))) {
			// It was not in fact a delimiter and we are outside of bracket scopes.
			return null;
		}
		console.assert(closingBrackets.includes(characterAtPoint(doc, endJump)),
			`editor.action.jumpToBracket jumped to non-bracket at ${strP(endJump)}.`);
		if (before) {
			const backJump = await jumpToBracket(textEditor, endJump);
			if (!backJump.isBefore(pos)) {
				console.assert(false,
					`editor.action.jumpToBracket back jump to ${strP(backJump)} did not return before cursor.`);
				return null;
			}
			return backJump;
		} else {
			return endJump.translate(0, 1);
		}
	}
	if (openingBrackets.includes(characterAtPoint(doc, pos))) {
		// "_(" or ")(" situation: skip over the right subscope and search again.
		const endJump = await jumpToBracket(textEditor, pos);
		// But first verify that the current bracket is a delimiter...
		if (openingBrackets.includes(characterAtPoint(doc, endJump))) {
			// We are outside any bracket scope.
			return null;
		}
		const backJump = await jumpToBracket(textEditor, endJump);
		if (backJump.isEqual(pos)) {
			return await findOuterBracket(textEditor, before, endJump.translate(0, 1));
		} else if (backJump.isBefore(pos)) {
			console.assert(openingBrackets.includes(characterAtPoint(doc, backJump)),
				`editor.action.jumpToBracket weird behavior: back jump to ${backJump}.`);
			if (before) {
				return backJump;
			} else {
				return endJump.translate(0, 1);
			}
		}
	}
	// Current character is non-bracket.
	let rightPos = nextPosition(doc, pos);
	if (rightPos.isEqual(pos)) {
		// End-of-document.
		return null;
	}
	if (closingBrackets.includes(characterAtPoint(doc, leftPos))) {
		// ")_" situation: start after "_" to move away from the left subscope.
		return await findOuterBracket(textEditor, before, rightPos);
	}
	// "__" situation: free to jump.
	const endJump = await jumpToBracket(textEditor, pos);
	if (endJump.isEqual(pos) || openingBrackets.includes(characterAtPoint(doc, endJump))) {
		// Outside of any bracket scope.
		return null;
	}
	if (before) {
		return await jumpToBracket(textEditor, endJump);
	} else {
		return endJump.translate(0, 1);
	}
}

async function findOuterBracketRaw(
	textEditor: vscode.TextEditor, before: boolean, pos: vscode.Position): Promise<vscode.Position | null> {
	// TODO: optimize by passing in a search limit range, if any.
	const doc = textEditor.document;
	const direction = before ? -1 : 1;
	const lastOffset = doc.offsetAt(doc.validatePosition(new vscode.Position(doc.lineCount, 1)));
	const incrBrackets = before ? closingBracketsRaw : openingBracketsRaw;
	const decrBrackets = !before ? closingBracketsRaw : openingBracketsRaw;
	let nesting = 0;
	for (let offset = doc.offsetAt(pos); 0 <= offset && offset <= lastOffset; offset += direction) {
		const offsetPos = doc.positionAt(offset);
		// \r\n endline.
		if (doc.offsetAt(offsetPos) !== offset) { continue; }
		if (before && offsetPos.character === 0) {
			continue;
		}
		const lookingAtPos = before ? offsetPos.translate(0, -1) : offsetPos;
		const lookingAt = characterAtPoint(doc, lookingAtPos);
		if (incrBrackets.includes(lookingAt)) { ++nesting; }
		else if (decrBrackets.includes(lookingAt)) { --nesting; }
		if (nesting === -1) {
			return offsetPos.translate(0, direction);
		}
	}
	return null;
}

export async function goToOuterScope(textEditor: vscode.TextEditor, select: boolean, before: boolean, near: boolean) {
	// State update might interact with the UI, save UI state early.
	const savedSelection = textEditor.selection;
	const pos = savedSelection.active;
	let state = await updateStateForPosition(textEditor);
	const symbol = state.lastSymbolAndAncestors.pop();
	const configuration = vscode.workspace.getConfiguration();
	const bracketsMode = configuration.get<string>("navi-parens.bracketScopeMode");
	let result = bracketsMode === "JumpToBracket" ? await findOuterBracket(textEditor, before, pos) :
		bracketsMode === "Raw" ? await findOuterBracketRaw(textEditor, before, pos) : null;
	console.assert(!!result || bracketsMode === "None", `Unknown Bracket Scope Mode ${bracketsMode}.`);
	const doc = textEditor.document;
	if (near && !!result) {
		result = before ? nextPosition(doc, result) : previousPosition(doc, result);
	}
	if (!!symbol) {
		const symbolResult = before ? (near ? nextPosition(doc, symbol.selectionRange.end) : symbol.range.start) :
			(near ? previousPosition(doc, symbol.range.end) : symbol.range.end);
		if (!result) {
			result = symbolResult;
		} else if (before && result.isBefore(symbolResult)) {
			result = symbolResult;
		} else if (!before && result.isAfter(symbolResult)) {
			result = symbolResult;
		}
	}
	if (!result) {
		textEditor.selection = savedSelection;
		if (state.leftVisibleRange) {
			textEditor.revealRange(state.lastVisibleRange);
		}
		return;	
	}
	const anchor = select ? textEditor.selection.anchor : result;
	textEditor.selection = new vscode.Selection(anchor, result);
	if (!state.lastVisibleRange.contains(textEditor.selection)) {
		textEditor.revealRange(textEditor.selection);
	} else if (state.leftVisibleRange) {
		textEditor.revealRange(state.lastVisibleRange);
	}
}

/** Finds the bracket scope to skip over, if any. The active position is the target to skip to.
 * Returns false if search limit exceeded or end of document, true when hitting an outer scope limit.
 * searchLimit: where to stop searching for the closer end of the scope.
 */
async function findSiblingBracket(
	textEditor: vscode.TextEditor, raw: boolean, before: boolean, pos: vscode.Position,
	searchLimit: vscode.Position | null
): Promise<vscode.Selection | boolean> {
	const doc = textEditor.document;
	const direction = before ? -1 : 1;
	const lastOffset = doc.offsetAt(doc.validatePosition(new vscode.Position(doc.lineCount, 1)));
	const incrBrackets = before ? (raw ? closingBracketsRaw : closingBrackets) :
		(raw ? openingBracketsRaw : openingBrackets);
	const decrBrackets = !before ? (raw ? closingBracketsRaw : closingBrackets) :
		(raw ? openingBracketsRaw : openingBrackets);
	// `nesting` and `updated` only used when raw is true.
	let nesting = 0;
	let updated = false;
	let jumpPos = null;
	for (let offset = doc.offsetAt(pos); 0 <= offset && offset <= lastOffset; offset += direction) {
		const offsetPos = doc.positionAt(offset);
		// \r\n endline.
		if (doc.offsetAt(offsetPos) !== offset) { continue; }
		// Only limit entering a bracket scope.
		if (searchLimit && !updated &&
			(before ? offsetPos.isBefore(searchLimit) : offsetPos.isAfter(searchLimit))) {
			return false;
		}
		if (before && offsetPos.character === 0) {
			continue;
		}
		const lookingAtPos = before ? offsetPos.translate(0, -1) : offsetPos;
		const lookingAt = characterAtPoint(doc, lookingAtPos);
		if (incrBrackets.includes(lookingAt)) {
			if (raw) {
				if (!updated) { jumpPos = lookingAtPos; }
				++nesting; updated = true;
			} else {
				let targetPos = await jumpToBracket(textEditor, lookingAtPos);
				// Verify it was an active delimiter by backjumping.
				jumpPos = await jumpToBracket(textEditor, targetPos);
				if (jumpPos.isEqual(lookingAtPos)) {
					targetPos = before ? targetPos : targetPos.translate(0, 1);
					return new vscode.Selection(jumpPos, targetPos);
				}
			}
		}
		else if (decrBrackets.includes(lookingAt)) {
			if (raw) {
				--nesting; updated = true;
			} else {
				// Verify it is an active outer scope delimiter. If yes, bail out.
				let endJump = await jumpToBracket(textEditor, lookingAtPos);
				if (before) {
					const backJump = await jumpToBracket(textEditor, endJump);
					if (backJump.isEqual(lookingAtPos)) { return true; }
				} else {
					if (endJump.isBefore(offsetPos)) { return true; }
				}
			}
		}
		if (updated && nesting === 0) {
			if (!jumpPos) {
				console.assert(false, 'findSiblingBracket anchor not initialized.');
				return false;
			}
			return new vscode.Selection(jumpPos, offsetPos.translate(0, direction));
		}
		if (updated && nesting < 0) { return true; }
	}
	return false;
}

export async function goPastSiblingScope(textEditor: vscode.TextEditor, select: boolean, before: boolean) {
	// State update might interact with the UI, save UI state early.
	const savedSelection = textEditor.selection;
	let state = await updateStateForPosition(textEditor);
	const stack = state.lastSymbolAndAncestors;
	// First, find a defined-symbol candidate, if any.
	const siblingSymbols = stack.length > 0 ? stack[stack.length - 1].children : state.rootSymbols;
	const pos = textEditor.selection.active;
	const good = (s: vscode.Range) => before ? s.end.isBeforeOrEqual(pos) : s.start.isAfterOrEqual(pos);
	let candidate: vscode.Range | null = null;
	const better = (s: vscode.Range) => before ? candidate?.end.isBefore(s.end) : candidate?.start.isAfter(s.start);
	for (const sibling of siblingSymbols) {
		if (!good(sibling.range)) {
			continue;
		}
		if (!candidate || better(sibling.range) || sibling.range.contains(candidate)) {
			candidate = sibling.range;
		}
	}
	// Check if there are any brackets to consider.
	let searchLimit = candidate ? (before ? candidate.end : candidate.start) : null;
	if (!candidate && stack.length > 0) {
		const symbolRange = stack[stack.length - 1].range;
		searchLimit = before ? symbolRange.start : symbolRange.end;
	}
	let targetPos = candidate ? (before ? candidate.start : candidate.end) : null;
	const bracketsMode = vscode.workspace.getConfiguration().get<string>("navi-parens.bracketScopeMode");
	const bracketScope = bracketsMode === "None" ? false :
		await findSiblingBracket(textEditor, bracketsMode === "Raw", before, pos, searchLimit);
	// Becasue of the search limit, the anchor of bracketScope cannot be on the wrong side of `candidate`.
	if (bracketScope === false) {
		// noop
	} else if (bracketScope === true) {
		targetPos = null;
	} else {
		if (!candidate || !candidate.contains(bracketScope)) {
				targetPos = bracketScope.active;
		}
	}
	if (!targetPos) {
		textEditor.selection = savedSelection;
		if (state.leftVisibleRange) {
			textEditor.revealRange(state.lastVisibleRange);
		}
		return;
	}
	const anchor = select ? textEditor.selection.anchor : targetPos;
	textEditor.selection = new vscode.Selection(anchor, targetPos);
	// jumpToBracket could have moved the screen.
	if (!state.lastVisibleRange.contains(textEditor.selection)) {
		textEditor.revealRange(textEditor.selection);
	} else if (state.leftVisibleRange) {
		textEditor.revealRange(state.lastVisibleRange);
	}
}

export async function goToEmptyLine(textEditor: vscode.TextEditor, select: boolean, before: boolean) {
	const doc = textEditor.document;
	const pos = textEditor.selection.active;
	const direction = before ? -1 : 1;
	let targetPos = null;
	for (let line = pos.line + direction; 0 <= line && line < doc.lineCount; line += direction) {
		const text = doc.lineAt(line);
		if (text.isEmptyOrWhitespace) { 
			targetPos = new vscode.Position(line, 0);
			break;
		 }
	}
	if (!targetPos) { return; }
	const anchor = select ? textEditor.selection.anchor : targetPos;
	textEditor.selection = new vscode.Selection(anchor, targetPos);
	textEditor.revealRange(textEditor.selection);
}

function configurationChangeUpdate(event: vscode.ConfigurationChangeEvent) {
	if (event.affectsConfiguration('navi-parens.blockScopeMode')) {
		for (const kv of documentStates) {
			kv[1].needsUpdate = true;
		}
	}
	const configuration = vscode.workspace.getConfiguration();
	if (event.affectsConfiguration('navi-parens.closingBrackets')) {
		const closingBracketsConfig = configuration.get<string[]>("navi-parens.closingBrackets");
		if (closingBracketsConfig) {
			closingBrackets = closingBracketsConfig;
		}
	}
	if (event.affectsConfiguration('navi-parens.openingBrackets')) {
		const openingBracketsConfig = configuration.get<string[]>("navi-parens.openingBrackets");
		if (openingBracketsConfig) {
			openingBrackets = openingBracketsConfig;
		}
	}
}

function cycleBracketScopeMode(_textEditor: vscode.TextEditor) {
	const configuration = vscode.workspace.getConfiguration();
	const bracketsMode = configuration.get<string>("navi-parens.bracketScopeMode");
	let newMode = bracketsMode === "None" ? "JumpToBracket" : (
		bracketsMode === "JumpToBracket" ? "Raw" : (bracketsMode === "Raw" ? "None" : null)
	);
	if (!newMode) {
		console.assert(false, `Unknown setting for navi-parens.bracketScopeMode: ${bracketsMode}.`);
		newMode = "None";
	}
	configuration.update("navi-parens.bracketScopeMode", newMode,
		vscode.ConfigurationTarget.Global, true);
}

function cycleBlockScopeMode(_textEditor: vscode.TextEditor) {
	const configuration = vscode.workspace.getConfiguration();
	const blocksMode = configuration.get<string>("navi-parens.blockScopeMode");
	let newMode = blocksMode === "None" ? "Semantic" : (
		blocksMode === "Semantic" ? "Indentation" : (blocksMode === "Indentation" ? "None" : null)
	);
	if (!newMode) {
		console.assert(false, `Unknown setting for navi-parens.blockScopeMode: ${blocksMode}.`);
		newMode = "None";
	}
	configuration.update("navi-parens.blockScopeMode", newMode,
		vscode.ConfigurationTarget.Global, true);
}

export function activate(context: vscode.ExtensionContext) {
	console.log('Congratulations, the extension "navi-parens" is being activated!');

	const configuration = vscode.workspace.getConfiguration();
	const closingBracketsConfig = configuration.get<string[]>("navi-parens.closingBrackets");
	if (closingBracketsConfig) {
		closingBrackets = closingBracketsConfig;
	}
	const openingBracketsConfig = configuration.get<string[]>("navi-parens.openingBrackets");
	if (openingBracketsConfig) {
		openingBrackets = openingBracketsConfig;
	}
	vscode.workspace.onDidChangeConfiguration(configurationChangeUpdate);

	vscode.workspace.onDidChangeTextDocument(event => {
		const uri = event.document.uri;
		const state = documentStates.get(uri);
		if (state) { state.needsUpdate = true; }
	}, null, context.subscriptions);

	function newCommand(
			command: string, callback: (textEditor: vscode.TextEditor, ...args: any[]) => void) {
		context.subscriptions.push(vscode.commands.registerTextEditorCommand(command, callback));
	}

	newCommand('navi-parens.goPastNextScope', textEditor => goPastSiblingScope(textEditor, false, false));
	newCommand('navi-parens.goPastPreviousScope', textEditor => goPastSiblingScope(textEditor, false, true));
	newCommand('navi-parens.selectPastNextScope', textEditor => goPastSiblingScope(textEditor, true, false));
	newCommand('navi-parens.selectPastPreviousScope', textEditor => goPastSiblingScope(textEditor, true, true));
	newCommand('navi-parens.goToUpScope', textEditor => goToOuterScope(textEditor, false, true, false));
	newCommand('navi-parens.goToDownScope', textEditor => goToOuterScope(textEditor, false, false, false));
	newCommand('navi-parens.selectToUpScope', textEditor => goToOuterScope(textEditor, true, true, false));
	newCommand('navi-parens.selectToDownScope', textEditor => goToOuterScope(textEditor, true, false, false));
	newCommand('navi-parens.goToBeginScope', textEditor => goToOuterScope(textEditor, false, true, true));
	newCommand('navi-parens.goToEndScope', textEditor => goToOuterScope(textEditor, false, false, true));
	newCommand('navi-parens.selectToBeginScope', textEditor => goToOuterScope(textEditor, true, true, true));
	newCommand('navi-parens.selectToEndScope', textEditor => goToOuterScope(textEditor, true, false, true));
	newCommand('navi-parens.cycleBracketScopeMode', cycleBracketScopeMode);
	newCommand('navi-parens.cycleBlockScopeMode', cycleBlockScopeMode);
	newCommand('navi-parens.goToPreviousEmptyLine', textEditor => goToEmptyLine(textEditor, false, true));
	newCommand('navi-parens.goToNextEmptyLine', textEditor => goToEmptyLine(textEditor, false, false));
	newCommand('navi-parens.selectToPreviousEmptyLine', textEditor => goToEmptyLine(textEditor, true, true));
	newCommand('navi-parens.selectToNextEmptyLine', textEditor => goToEmptyLine(textEditor, true, false));
}

export function deactivate() {}

// And just some parting (parenthesized) comments.