import assert = require('assert');
import * as vscode from 'vscode';

interface DocumentNavigationState {
	/** Whether current state has potentially been invalidated, due to a document change. */
	needsUpdate: boolean;

  /** Cache for the symbol trees for the whole document. Lazily updated. */
	rootSymbols: vscode.DocumentSymbol[];

	/** A stack of ancestor symbols with the current symbol at the last (top) position. */
	lastSymbolAndAncestors: vscode.DocumentSymbol[];
	
	/** The encompassing brackets scope, on last update. The scope is from the start of the opening bracket to the end of the closing bracket. */
	lastBracketScope: vscode.Range | null;

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

/** From Navi Parens perspective, positions on the border of a scope are outside of the scope. */
function containsInside(range: vscode.Range, pos: vscode.Position): boolean {
	return range.contains(pos) && !range.start.isEqual(pos) && !range.end.isEqual(pos);
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
			needsUpdate: true, rootSymbols: [], lastSymbolAndAncestors: [], lastBracketScope: null, lastPosition: pos,
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
			needsUpdate: true, rootSymbols: [], lastSymbolAndAncestors: [], lastBracketScope: null, lastPosition: pos,
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
		state.rootSymbols = 
			await vscode.commands.executeCommand<vscode.DocumentSymbol[]>('vscode.executeDocumentSymbolProvider', uri);
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

	const savedSelection = textEditor.selection;
	let endScope = await jumpToBracket(textEditor, pos);
	let startScope = await jumpToBracket(textEditor, endScope);
	if (startScope.isAfter(endScope)) {
		// Perhaps the cursor was initially touching the outer bracket from the inside.
		[startScope, endScope] = [endScope, startScope];
	}
	if (startScope.isAfterOrEqual(pos)) {
		// Semantics mismatch -- there was a scope right-adjacent to the cursor.
		endScope = await jumpToBracket(textEditor, pos.translate(0, -1));
		startScope = await jumpToBracket(textEditor, endScope);
		if (startScope.isAfter(endScope)) {
			[startScope, endScope] = [endScope, startScope];
		}
	}
	while (endScope.isBefore(pos)) {
		// Moving to the left put us inside another scope, get out of it.
		// If we run too far, `containsInside` below will be false, so OK.
		endScope = await jumpToBracket(textEditor, startScope.translate(0, -1));
		if (endScope.isEqual(startScope)) {
			// Outside of any scope, lastBracketScope will be null.
			break;
		}
		startScope = await jumpToBracket(textEditor, endScope);
		if (startScope.isAfter(endScope)) {
			[startScope, endScope] = [endScope, startScope];	
		}
	}
	// Select past the outer bracket.
	// TODO: support mulit-character tokens.
	const bracketRange = new vscode.Range(startScope, endScope.translate(0, 1));
	if (containsInside(bracketRange, pos)) {
		state.lastBracketScope = bracketRange;
	} else {
		state.lastBracketScope = null;
	}
	textEditor.selection = savedSelection;

	return state;
}

async function goToOuterScope(textEditor: vscode.TextEditor, select: boolean, point: (r: vscode.Range) => vscode.Position) {
	let state = await updateStateForPosition(textEditor);
	let currentRange = state.lastSymbolAndAncestors.pop()?.range;
	if (!currentRange) {
		if (!state.lastBracketScope) {
			return;
		} else {
			currentRange = state.lastBracketScope;
		}
	} else if (!!state.lastBracketScope && currentRange.contains(state.lastBracketScope)) {
		currentRange = state.lastBracketScope;
	}
	const cursor = point(currentRange);
	const anchor = select ? textEditor.selection.anchor : cursor;
	textEditor.selection = new vscode.Selection(anchor, cursor);
	if (!state.lastVisibleRange.contains(textEditor.selection)) {
		textEditor.revealRange(textEditor.selection);
	} else if (state.leftVisibleRange) {
		textEditor.revealRange(state.lastVisibleRange);
	}
}

async function goPastSiblingScope(textEditor: vscode.TextEditor, select: boolean, before: boolean) {
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
	let doc = textEditor.document;
	// Delimit search for the bracket by: the cursor, the candidate, the parent bracket scope, the parent defined symbol.
	let gap;
	if (candidate) {
		gap = before ? new vscode.Range(candidate.end, pos) : new vscode.Range(pos, candidate.start);
	} else {
		let invalidRange = new vscode.Range(0, 0, doc.lineCount, 0);
		let fullRange = doc.validateRange(invalidRange);
		gap = before ? new vscode.Range(fullRange.start, pos) : new vscode.Range(pos, fullRange.end);
	}
	if (state.lastBracketScope) {
		gap = gap.intersection(state.lastBracketScope);
		console.assert(gap, 'Unexpected bracket scope at cursor.');
	}
	if (stack.length > 0) {
		gap = gap?.intersection(stack[stack.length - 1].range);
		console.assert(gap, 'Unexpected defined-symbol scope at cursor.');
	}
	if (!gap) {	return;	}
	const gapText = doc.getText(gap);
	const bracketTriggers = before ? [")", "]", "}", ">"] : ["(", "[", "{", "<"];
	function bracketOffset(last: number) {
		let start = last + (before ? -1 : 1);
		const f = (b: string) => before ? gapText.lastIndexOf(b, start) :  gapText.indexOf(b, start);
		const indices: number[] = bracketTriggers.map(f).filter(idx => idx !== -1);
		if (indices.length === 0) { return -1; }
		return before ? Math.max(...indices) : Math.min(...indices);
	}
	let lastOffset = before ? gapText.length : -1;
	let targetPos: vscode.Position | null = null;
	// Ignore delimiters in comments or string literals etc. by keeping looking.
	while (true) {
		lastOffset = bracketOffset(lastOffset);
		if (lastOffset === -1) { targetPos = null; break; }
		let offsetPos = doc.positionAt(doc.offsetAt(gap.start) + lastOffset);
		targetPos = await jumpToBracket(textEditor, offsetPos);
		// We could have jumped to outer bracket scope.
		if (!gap.contains(targetPos)) { continue; }
		// If we are outside any bracket scope, we could have jumped to a start of bracket.
		if (!before && !!state.lastBracketScope &&
			 bracketTriggers.includes(doc.getText(new vscode.Range(targetPos, targetPos.translate(0, 1))))) {
				continue;
		}
		if (before ? targetPos.isBefore(offsetPos) : targetPos.isAfter(offsetPos)) { break; }
	}
	if (!before && !!targetPos) { targetPos = targetPos.translate(0, 1); }

	// Checking !gap.contains(targetPos) for robustness, it shouldn't happen.
	if (!targetPos || !gap.contains(targetPos)) {
		if (!candidate) {
			if (!!targetPos) { console.warn('Navi Parens: Things broke, maybe a bug. Bailing out.'); }
			textEditor.selection = savedSelection;
			if (state.leftVisibleRange) {
				textEditor.revealRange(state.lastVisibleRange);
			}
			 return;
		}
		targetPos = before ? candidate.start : candidate.end;
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

export function activate(context: vscode.ExtensionContext) {
	console.log('Congratulations, the extension "navi-parens" is being activated!');

	vscode.workspace.onDidChangeTextDocument(event => {
		const uri = event.document.uri;
		const state = documentStates.get(uri);
		if (state) { state.needsUpdate = true; }
	}, null, context.subscriptions);

	function newCommand(command: string, callback: (textEditor: vscode.TextEditor, ...args: any[]) => void) {
		context.subscriptions.push(vscode.commands.registerTextEditorCommand(command, callback));
	}

	newCommand('navi-parens.goPastNextScope', textEditor => goPastSiblingScope(textEditor, false, false));
	newCommand('navi-parens.goPastPreviousScope', textEditor => goPastSiblingScope(textEditor, false, true));
	newCommand('navi-parens.selectPastNextScope', textEditor => goPastSiblingScope(textEditor, true, false));
	newCommand('navi-parens.selectPastPreviousScope', textEditor => goPastSiblingScope(textEditor, true, true));
	newCommand('navi-parens.goToUpScope', textEditor => goToOuterScope(textEditor, false, r => r.start));
	newCommand('navi-parens.goToDownScope', textEditor => goToOuterScope(textEditor, false, r => r.end));
	newCommand('navi-parens.selectToUpScope', textEditor => goToOuterScope(textEditor, true, r => r.start));
	newCommand('navi-parens.selectToDownScope', textEditor => goToOuterScope(textEditor, true, r => r.end));
}

export function deactivate() {}
