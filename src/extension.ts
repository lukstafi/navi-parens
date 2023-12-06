import { assert } from 'console';
// import { off } from 'process';
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

function escapeRegExp(s: string) {
	if (s.startsWith("/") && s.endsWith("/")) {
		return s.substring(1, s.length - 1);
	}
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
}

// In case of doubt, add more parentheses.
function escapeRegExps(strings: string[]) {
	return strings.map(s => '(?:' + escapeRegExp(s) + ')').join('|');
}

const noMatchRegex = /^\b$/;
// The superset of supported closing and opening delimiters.
const closingBrackets: string[] = [")", "]", "}", ">"];
const openingBrackets: string[] = ["(", "[", "{", "<"];
let closingBeforeRawRegex: RegExp | null = null;
let openingBeforeRawRegex: RegExp | null = null;
let separatorsMMBeforeRawRegex: RegExp | null = null;
let separatorsNoMMBeforeRawRegex: RegExp | null = null;
let pseudoSepMMBeforeRawRegex: RegExp | null = null;
let pseudoSepNoMMBeforeRawRegex: RegExp | null = null;
let closingAfterRawRegex: RegExp | null = null;
let openingAfterRawRegex: RegExp | null = null;
let separatorsMMAfterRawRegex: RegExp | null = null;
let separatorsNoMMAfterRawRegex: RegExp | null = null;
let pseudoSepMMAfterRawRegex: RegExp | null = null;
let pseudoSepNoMMAfterRawRegex: RegExp | null = null;
let closingRawMaxLength: number | null = null;
let openingRawMaxLength: number | null = null;
let naviStatusBarItem: vscode.StatusBarItem;

function makeRegExp(s: string) {
	return new RegExp(s, 'u');
}

// v2: scope markings.
// const markmacsBegLightTheme = "\\textcolor{firebrick}{";
// const markmacsMidLightTheme = "}\\textcolor{indianred}{";
// const markmacsEndLightTheme = "}\\textcolor{peru}{}";
// const markmacsBegDarkTheme = "\\textcolor{chartreuse}{";
// const markmacsMidDarkTheme = "}\\textcolor{limegreen}{";
// const markmacsEndDarkTheme = "}\\textcolor{papayawhip}{}";
// let isCurrentThemeLight =
// 	vscode.window.activeColorTheme.kind === 1 /* Light */ ||
// 	vscode.window.activeColorTheme.kind === 4 /* HighContrastLight */;
// let markmacsBeg =
// 	isCurrentThemeLight ? markmacsBegLightTheme : markmacsBegDarkTheme;
// let markmacsMid =
// 	isCurrentThemeLight ? markmacsMidLightTheme : markmacsMidDarkTheme;
// let markmacsEnd =
// 	isCurrentThemeLight ? markmacsEndLightTheme : markmacsEndDarkTheme;

// const markmacsSeparators =
// 	[markmacsBegLightTheme, markmacsMidLightTheme, markmacsEndLightTheme,
// 		markmacsBegDarkTheme, markmacsMidDarkTheme, markmacsEndDarkTheme];
// const markmacsBeforeRegex = makeRegExp('(' + escapeRegExps(markmacsSeparators) + ')$');
// const markmacsAfterRegex = makeRegExp('^(' + escapeRegExps(markmacsSeparators) + ')');

/** From Navi Parens perspective, positions on the border of a scope are outside of the scope. */
function containsInside(range: vscode.Range, pos: vscode.Position): boolean {
	return range.contains(pos) && !range.start.isEqual(pos) && !range.end.isEqual(pos);
}

function strP(pos: vscode.Position): string {
	return `${pos.line},${pos.character}`;
}

function strR(range: vscode.Range) {
	return `[${strP(range.start)}--${strP(range.end)}]`;
}

function isNearer(before: boolean, nearerPos: vscode.Position, fartherPos: vscode.Position) {
	if (before) {
		return nearerPos.isAfter(fartherPos);
	} else {
		return nearerPos.isBefore(fartherPos);
	}
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
		// Always call the SymbolProvider, therefore do not set needsUpdate on mode change:
		// the JTB cache is a precious resource that should only be cleared on edit.
		state.rootSymbols =
			await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
				'vscode.executeDocumentSymbolProvider', uri);
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
	while (!!(parentSymbol = state.lastSymbolAndAncestors.pop()) && !parentSymbol?.range.contains(pos)) { }
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

function atPosition(doc: vscode.TextDocument, offset: number) {
	let pos = doc.positionAt(offset);
	if (pos.isEqual(doc.positionAt(offset - 1))) {
		// In case endline is represented as two characters in the document.
		pos = doc.positionAt(offset + 1);
	}
	// else if (pos.isEqual(doc.positionAt(offset + 1))) {
	// In case endline is represented as two characters in the document.
	// pos = doc.positionAt(offset - 1);
	// }
	return pos;
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
	textEditor: vscode.TextEditor, before: boolean, pos: vscode.Position): Promise<vscode.Selection | null> {
	const doc = textEditor.document;
	// TODO(3): the rules do not handle multicharacter brackets.

	// If we are touching a bracket from the outside and we wouldn't cross a scope moving beside, jump from there
	// rather than current position, to minimize jumpToBracket calls.
	let from = pos;
	const allBrackets = openingBrackets.concat(closingBrackets);
	let leftPos = pos.character === 0 ? null : doc.validatePosition(pos.translate(0, -1));
	let rightPos = doc.validatePosition(pos.translate(0, 1));
	if (openingBrackets.includes(characterAtPoint(doc, pos))) {
		// From an opening bracket, we can only move left.
		if (leftPos && leftPos !== pos && !allBrackets.includes(characterAtPoint(doc, leftPos))) {
			// Moving left into a bracket position always crosses a scope (exiting on open or entering on close).
			let leftLeft = leftPos.character === 0 ? null : doc.validatePosition(leftPos.translate(0, -1));
			if (leftLeft && !closingBrackets.includes(characterAtPoint(doc, leftLeft))) {
				// Not worth moving next to a sibling-scope bracket, otherwise good.
				from = leftPos;
			}
		}
	} else if (leftPos && leftPos !== pos && !allBrackets.includes(characterAtPoint(doc, pos))) {
		// Otherwise it is better to go right or stay in place. Going right crosses scopes iff there is any
		// bracket at `pos`.
		if (rightPos && rightPos !== pos && !openingBrackets.includes(characterAtPoint(doc, rightPos))) {
			// Not worth moving next to a sibling-scope bracket, otherwise good.
			from = rightPos;
		}
	}
	// In all cases, we need both ends of a scope, both verified via Jump To Bracket.
	let jumpPos = await jumpToBracket(textEditor, from);
	let jumpBack = await jumpToBracket(textEditor, jumpPos);
	if (jumpPos.isBefore(pos) && jumpBack.isAfterOrEqual(pos)) {
		if (!(from.isEqual(jumpBack) &&
			closingBrackets.includes(characterAtPoint(doc, jumpBack)))) {
			console.assert(false,
				`Unexpected Jump To Bracket behavior with jumps ${strP(from)} -> ${strP(jumpPos)} -> ${strP(jumpBack)}.`);
		}
		if (before) {
			return new vscode.Selection(jumpBack.translate(0, 1), jumpPos);
		} else {
			return new vscode.Selection(jumpPos, jumpBack.translate(0, 1));
		}
	}
	if (jumpBack.isBefore(pos) && jumpPos.isAfter(pos)) {
		if (before) {
			return new vscode.Selection(jumpPos.translate(0, 1), jumpBack);
		} else {
			return new vscode.Selection(jumpBack, jumpPos.translate(0, 1));
		}
	}
	// If we could not locate the outer scope from the current position, we need to jump over a sibling scope.
	const rightwardPos = jumpPos.isBefore(jumpBack) ? jumpBack : jumpPos;
	if (rightwardPos.isAfter(pos) && rightwardPos.isAfter(from)) {
		// Note that rightwardPos will be at the closing bracket inside the sibling scope, moving out of it.
		const landedAt = characterAtPoint(doc, rightwardPos);
		console.assert(closingBrackets.includes(landedAt),
			`Unexpected landing of Jump To Bracket at position ${strP(rightwardPos)} -- character "${landedAt}".`);
		const nextPos = rightwardPos.translate(0, 1);
		return findOuterBracket(textEditor, before, nextPos);
	}
	return null;
}

enum DelimiterType {
	opening,
	closing,
	separator,
	// markmacs,
	jointDelimiters,
}

function oneOfAtPoint(doc: vscode.TextDocument, delimiter: DelimiterType, isRaw: boolean,
	before: boolean, pos: vscode.Position): string | null {
	if (!isRaw) {
		const direction = before ? -1 : 1;
		let lookingAtPos = pos.translate(0, Math.min(direction, 0));
		const lookingAt = characterAtPoint(doc, lookingAtPos);
		const delimiters =
			delimiter === DelimiterType.closing ? closingBrackets :
				delimiter === DelimiterType.opening ? openingBrackets : [];
		return delimiters.includes(lookingAt) ? lookingAt : null;
	}
	let configuration = null;
	if (!closingBeforeRawRegex || !closingAfterRawRegex) {
		configuration = vscode.workspace.getConfiguration();
		const closingBracketsRaw = configuration.get<string[]>("navi-parens.closingBracketsRaw") || [];
		if (closingBracketsRaw.length > 0) {
			closingBeforeRawRegex = makeRegExp('(' + escapeRegExps(closingBracketsRaw) + ')$');
			closingAfterRawRegex = makeRegExp('^(' + escapeRegExps(closingBracketsRaw) + ')');
		} else {
			closingBeforeRawRegex = makeRegExp('(' + escapeRegExps(closingBrackets) + ')$');
			closingAfterRawRegex = makeRegExp('^(' + escapeRegExps(closingBrackets) + ')');
		}
	}
	if (!openingBeforeRawRegex || !openingAfterRawRegex) {
		if (!configuration) {
			configuration = vscode.workspace.getConfiguration();
		}
		const openingBracketsRaw = configuration.get<string[]>("navi-parens.openingBracketsRaw") || [];
		if (openingBracketsRaw.length > 0) {
			openingBeforeRawRegex = makeRegExp('(' + escapeRegExps(openingBracketsRaw) + ')$');
			openingAfterRawRegex = makeRegExp('^(' + escapeRegExps(openingBracketsRaw) + ')');
		} else {
			openingBeforeRawRegex = makeRegExp('(' + escapeRegExps(openingBrackets) + ')$');
			openingAfterRawRegex = makeRegExp('^(' + escapeRegExps(openingBrackets) + ')');
		}
	}
	if (!separatorsMMBeforeRawRegex || !separatorsMMAfterRawRegex) {
		if (!configuration) {
			configuration = vscode.workspace.getConfiguration();
		}
		const separatorsMM = configuration.get<string[]>("navi-parens.separatorsMM") || [];
		if (separatorsMM.length > 0) {
			separatorsMMBeforeRawRegex = makeRegExp('(' + escapeRegExps(separatorsMM) + ')$');
			separatorsMMAfterRawRegex = makeRegExp('^(' + escapeRegExps(separatorsMM) + ')');
		} else {
			separatorsMMBeforeRawRegex = makeRegExp('(' + escapeRegExps([',', ';']) + ')$');
			separatorsMMAfterRawRegex = makeRegExp('^(' + escapeRegExps([',', ';']) + ')');
		}
	}
	if (!separatorsNoMMBeforeRawRegex || !separatorsNoMMAfterRawRegex) {
		if (!configuration) {
			configuration = vscode.workspace.getConfiguration();
		}
		const separatorsNoMM = configuration.get<string[]>("navi-parens.separatorsNoMM") || [];
		if (separatorsNoMM.length > 0) {
			separatorsNoMMBeforeRawRegex = makeRegExp('(' + escapeRegExps(separatorsNoMM) + ')$');
			separatorsNoMMAfterRawRegex = makeRegExp('^(' + escapeRegExps(separatorsNoMM) + ')');
		} else {
			separatorsNoMMBeforeRawRegex = makeRegExp('(' + escapeRegExps([',', ';']) + ')$');
			separatorsNoMMAfterRawRegex = makeRegExp('^(' + escapeRegExps([',', ';']) + ')');
		}
	}
	if (!pseudoSepMMBeforeRawRegex || !pseudoSepMMAfterRawRegex) {
		if (!configuration) {
			configuration = vscode.workspace.getConfiguration();
		}
		const pseudoSepMM = configuration.get<string>("navi-parens.pseudoSeparatorMM");
		if (pseudoSepMM) {
			pseudoSepMMBeforeRawRegex = makeRegExp('(' + pseudoSepMM + ')$');
			pseudoSepMMAfterRawRegex = makeRegExp('^(' + pseudoSepMM + ')');
		} else {
			pseudoSepMMBeforeRawRegex = noMatchRegex;
			pseudoSepMMAfterRawRegex = noMatchRegex;
		}
	}
	if (!pseudoSepNoMMBeforeRawRegex || !pseudoSepNoMMAfterRawRegex) {
		if (!configuration) {
			configuration = vscode.workspace.getConfiguration();
		}
		const pseudoSepNoMM = configuration.get<string>("navi-parens.pseudoSeparatorNoMM");
		if (pseudoSepNoMM && pseudoSepNoMM.length > 0) {
			pseudoSepNoMMBeforeRawRegex = makeRegExp('(' + pseudoSepNoMM + ')$');
			pseudoSepNoMMAfterRawRegex = makeRegExp('^(' + pseudoSepNoMM + ')');
		} else {
			pseudoSepNoMMBeforeRawRegex = noMatchRegex;
			pseudoSepNoMMAfterRawRegex = noMatchRegex;
		}
	}
	const translPos = before ? doc.lineAt(pos.line).range.start : doc.lineAt(pos.line).range.end;
	const textAtPoint = doc.getText(doc.validateRange(new vscode.Selection(pos, translPos)));
	if (delimiter !== DelimiterType.jointDelimiters) {
		const delimiters =
			delimiter === DelimiterType.closing ? (before ? closingBeforeRawRegex : closingAfterRawRegex) :
				delimiter === DelimiterType.opening ? (before ? openingBeforeRawRegex : openingAfterRawRegex) :
					delimiter === DelimiterType.separator ?
						(isMarkmacsMode() ? (before ? separatorsMMBeforeRawRegex : separatorsMMAfterRawRegex) :
							(before ? separatorsNoMMBeforeRawRegex : separatorsNoMMAfterRawRegex)) :
						// delimiter === DelimiterType.markmacs ? (before ? markmacsBeforeRegex : markmacsAfterRegex) :
						(isMarkmacsMode() ?
							(before ? pseudoSepMMBeforeRawRegex : pseudoSepMMAfterRawRegex) :
							(before ? pseudoSepNoMMBeforeRawRegex : pseudoSepNoMMAfterRawRegex));
		const matchResults = delimiters.exec(textAtPoint);
		return matchResults?.[0] || null;
	} else {
		const closing = (before ? closingBeforeRawRegex : closingAfterRawRegex).exec(textAtPoint);
		const opening = (before ? openingBeforeRawRegex : openingAfterRawRegex).exec(textAtPoint);
		const separator =
			(isMarkmacsMode() ? (before ? separatorsMMBeforeRawRegex : separatorsMMAfterRawRegex) :
				(before ? separatorsNoMMBeforeRawRegex : separatorsNoMMAfterRawRegex)).exec(textAtPoint);
		// const markmacs = (before ? markmacsBeforeRegex : markmacsAfterRegex).exec(textAtPoint);
		const pseudo =
			(isMarkmacsMode() ?
				(before ? pseudoSepMMBeforeRawRegex : pseudoSepMMAfterRawRegex) :
				(before ? pseudoSepNoMMBeforeRawRegex : pseudoSepNoMMAfterRawRegex)).exec(textAtPoint);
		const unull = (x: RegExpExecArray | null) => x ? [x[0]] : [];
		const matchResults =
			[...unull(closing), ...unull(opening), ...unull(separator),
			// ...unull(markmacs),
			...unull(pseudo)];
		if (matchResults.length === 0) {
			return null;
		}
		return matchResults.reduce((a, b) => a.length >= b.length ? a : b);
	}
}

function findOuterBracketRaw(
	textEditor: vscode.TextEditor, before: boolean, pos: vscode.Position, useSeparators: boolean,
	forOneLinerMin?: number | undefined
): vscode.Selection | null {
	const doc = textEditor.document;
	if (!closingRawMaxLength || !openingRawMaxLength) {
		const configuration = vscode.workspace.getConfiguration();
		const closingBracketsRaw = configuration.get<string[]>("navi-parens.closingBracketsRaw") || [];
		if (closingBracketsRaw.length > 0) {
			closingRawMaxLength = Math.max(...closingBracketsRaw.map(delim => delim.length));
		}
		const openingBracketsRaw = configuration.get<string[]>("navi-parens.openingBracketsRaw") || [];
		if (openingBracketsRaw.length > 0) {
			openingRawMaxLength = Math.max(...openingBracketsRaw.map(delim => delim.length));
		}
	}
	// Target end first, then anchor end.
	const direction = before ? [-1, 1] : [1, -1];
	const beforeFor = [before, !before];
	const lastOffset = doc.offsetAt(doc.validatePosition(new vscode.Position(doc.lineCount, 1)));
	const incrIsClosing = before ? [true, false] : [false, true];
	const decrIsClosing = [incrIsClosing[1], incrIsClosing[0]];
	let selection: Array<vscode.Position | null> = [null, null];
	const cursor = doc.offsetAt(pos);
	for (const side of [0, 1]) {
		let nesting = 0;
		let delta = direction[side];
		let skippedChars = 0;
		let offset = cursor - delta * Math.max(closingRawMaxLength || 0, openingRawMaxLength || 0);
		offset = Math.max(0, Math.min(offset, lastOffset));
		for (; 0 <= offset && offset <= lastOffset; offset += delta) {
			// Reset to the default delta.
			delta = direction[side];
			const offsetPos = doc.positionAt(offset);
			// \r\n endline.
			if (doc.offsetAt(offsetPos) !== offset) { continue; }
			// In case there is nothing to the left to look at.
			if (direction[side] === -1 && offsetPos.character === 0) {
				continue;
			}
			// const lookingAtMM = oneOfAtPoint(doc, DelimiterType.markmacs, true, beforeFor[side], offsetPos);
			// if (lookingAtMM) {
			// 	skippedChars += lookingAtMM.length;
			// 	delta = lookingAtMM.length * direction[side];
			// 	continue;
			// }
			const lookingAtIncr =
				oneOfAtPoint(doc, incrIsClosing[side] ? DelimiterType.closing : DelimiterType.opening, true,
					beforeFor[side], offsetPos);
			const lookingAtDecr =
				oneOfAtPoint(doc, decrIsClosing[side] ? DelimiterType.closing : DelimiterType.opening, true,
					beforeFor[side], offsetPos);
			const lookingAtSep =
				useSeparators ? oneOfAtPoint(doc, DelimiterType.separator, true, beforeFor[side], offsetPos) : null;
			const isIncr =
				lookingAtIncr && (!lookingAtDecr || lookingAtIncr.length > lookingAtDecr.length)
				&& (!lookingAtSep || lookingAtIncr.length > lookingAtSep.length);
			const isDecr =
				!isIncr && lookingAtDecr
				&& (!lookingAtSep || lookingAtDecr.length > lookingAtSep.length);
			const lookingAt = isIncr ? lookingAtIncr : (isDecr ? lookingAtDecr : lookingAtSep);
			const isPastCursor =
				lookingAt && (delta < 0 ? offset <= cursor : cursor < offset + lookingAt.length);
			const offsetChange = Math.abs(cursor - offset) - skippedChars;
			if (isPastCursor && forOneLinerMin && side === 0 && (offsetChange > forOneLinerMin)) {
				selection[side] = offsetPos.translate(0, lookingAt.length * direction[side]);
				break;
			}
			else if (isIncr && isPastCursor) {
				++nesting; delta = lookingAtIncr.length * direction[side];
			}
			else if (isDecr && isPastCursor) {
				--nesting; delta = lookingAtDecr.length * direction[side];
				if ((!forOneLinerMin || side === 1) && nesting === -1) {
					selection[side] = offsetPos.translate(0, lookingAtDecr.length * direction[side]);
					break;
				}
			}
			else if (
				(!forOneLinerMin || side === 1) && lookingAtSep && !isIncr && !isDecr && isPastCursor && nesting === 0
			) {
				selection[side] = offsetPos.translate(0, lookingAtSep.length * direction[side]);
				break;
			} else if (lookingAt) {
				delta = lookingAt.length * direction[side];;
			}
		}
	}
	if (selection[0] && selection[1]) { return new vscode.Selection(selection[1], selection[0]); }
	// Allow unmatched brackets in RAW mode.
	if (selection[0]) {
		const outerLimit = before ? doc.positionAt(lastOffset) : doc.positionAt(0);
		return new vscode.Selection(outerLimit, selection[0]);
	}
	return null;
}

async function findBracketScopeOverPos(
	textEditor: vscode.TextEditor, before: boolean, pos: vscode.Position): Promise<vscode.Selection | null> {
	const configuration = vscode.workspace.getConfiguration();
	const bracketsMode = configuration.get<string>("navi-parens.bracketScopeMode");
	let bracketScope = bracketsMode === "JumpToBracket" ? await findOuterBracket(textEditor, before, pos) :
		bracketsMode === "Raw" ? findOuterBracketRaw(textEditor, before, pos, /*useSeparators=*/false) : null;
	return bracketScope;
}

function countVisibleIndentation(textEditor: vscode.TextEditor, line: vscode.TextLine): number {
	const tabSize = Number(textEditor.options.tabSize);
	const updatedText = line.text.replace(/\t/g, " ".repeat(tabSize));
	const firstNonWhite = Number(updatedText.search(/[^ ]/g));
	if (firstNonWhite < 0) {
		return updatedText.length / tabSize;
	}
	return firstNonWhite / tabSize;
}

function findOuterIndentation(
	textEditor: vscode.TextEditor, before: boolean, near: boolean, pos: vscode.Position): vscode.Selection | null {
	const doc = textEditor.document;
	const direction = before ? [-1, 1] : [1, -1];
	let selection: Array<vscode.Position | null> = [null, null];
	// Note: there is an assymetry between the `-1` and `1` directions, because an indentation scope starts
	// with an undindented line and ends with an indented line!
	for (const side of [0, 1]) {
		let entryIndent = -1;
		let previousNo = -1;
		let previousIndent = -1;
		let previousFirstNonWhitespace = -1;
		let passingEmptyLine = false;
		for (let lineNo = pos.line; 0 <= lineNo && lineNo < doc.lineCount; lineNo += direction[side]) {
			const line = doc.lineAt(lineNo);
			if (line.isEmptyOrWhitespace && lineNo < doc.lineCount - 1 && lineNo > 0) {
				passingEmptyLine = true;
				continue;
			}
			// Note: indentation is different than `firstNonWhitespaceCharacterIndex`.
			// Note: allow begin/end-of-scope to find the begin/end of text and other-end indentation
			// to be "unmatched".
			const indentation = countVisibleIndentation(textEditor, line);
			if (entryIndent < 0) { entryIndent = indentation; }
			else if (indentation < entryIndent ||
				(line.isEmptyOrWhitespace && (lineNo === doc.lineCount - 1 || lineNo === 0) &&
					(near || side === 1))) {
				if (near) {
					if ((before && side === 0) || (!before && side === 1)) {
						selection[side] = new vscode.Position(previousNo, previousFirstNonWhitespace);
					} else {
						// Return end of the previous line.
						selection[side] = doc.lineAt(previousNo).range.end;
					}
				} else {
					const previousLinePos = doc.lineAt(lineNo - direction[side]).range.end;
					selection[side] = direction[side] === 1 && passingEmptyLine ?
						previousLinePos : new vscode.Position(lineNo, line.firstNonWhitespaceCharacterIndex);
				}
				break;
			}
			if ((near || side === 1) && (lineNo === doc.lineCount - 1 || lineNo === 0)) {
				if ((before && side === 0) || (!before && side === 1)) {
					selection[side] = new vscode.Position(lineNo, line.firstNonWhitespaceCharacterIndex);
				} else {
					selection[side] = doc.lineAt(lineNo).range.end;
				}
				break;
			}
			previousNo = lineNo;
			previousIndent = indentation;
			previousFirstNonWhitespace = line.firstNonWhitespaceCharacterIndex;
			passingEmptyLine = false;
		}
	}
	if (selection[0] && selection[1]) { return new vscode.Selection(selection[1], selection[0]); }
	return null;
}

export async function goToOuterScope(textEditor: vscode.TextEditor, select: boolean, before: boolean,
	near: boolean, useSeparators: boolean
) {
	// State update might interact with the UI, save UI state early.
	const savedSelection = textEditor.selection;
	const pos = savedSelection.active;
	let state = await updateStateForPosition(textEditor);
	const configuration = vscode.workspace.getConfiguration();
	const bracketsMode = configuration.get<string>("navi-parens.bracketScopeMode");
	let bracketScope = bracketsMode === "JumpToBracket" ? await findOuterBracket(textEditor, before, pos) :
		bracketsMode === "Raw" ? findOuterBracketRaw(textEditor, before, pos, useSeparators) : null;
	const doc = textEditor.document;
	if (near && bracketScope) {
		const cursor = doc.offsetAt(pos);
		const lookingAtS =
			oneOfAtPoint(doc, DelimiterType.opening, bracketsMode === "Raw", false, bracketScope.start) ||
			(useSeparators ?
				oneOfAtPoint(doc, DelimiterType.separator, bracketsMode === "Raw", false, bracketScope.start) : null);
		const altTranslS = doc.offsetAt(bracketScope.start) - cursor;
		const translS = altTranslS > 0 ? altTranslS : lookingAtS ? lookingAtS.length : 0;
		const bs = lookingAtS ? bracketScope.start.translate(0, translS) : bracketScope.start;
		const lookingAtE =
			oneOfAtPoint(doc, DelimiterType.closing, bracketsMode === "Raw", true, bracketScope.end) ||
			(useSeparators ?
				oneOfAtPoint(doc, DelimiterType.separator, bracketsMode === "Raw", true, bracketScope.end) : null);
		const altTranslE = cursor - doc.offsetAt(bracketScope.end);
		const translE = altTranslE > 0 ? altTranslE : lookingAtE ? lookingAtE.length : 0;
		const be = lookingAtE ? bracketScope.end.translate(0, -1 * translE) : bracketScope.end;
		bracketScope = before ? new vscode.Selection(be, bs) : new vscode.Selection(bs, be);
	}
	const blockMode = configuration.get<string>("navi-parens.blockScopeMode");
	let blockScope = null;
	if (blockMode === "Semantic") {
		const symbol = state.lastSymbolAndAncestors.pop();
		if (!!symbol && !near) {
			blockScope = before ? new vscode.Selection(symbol.range.end, symbol.range.start) :
				new vscode.Selection(symbol.range.start, symbol.range.end);
		} else if (!!symbol && near) {
			const allBrackets = openingBrackets.concat(closingBrackets);
			const re = symbol.range.end;
			const rangeEnd = allBrackets.includes(characterAtPoint(doc, re)) ? previousPosition(doc, re) : re;
			blockScope = before ? new vscode.Selection(rangeEnd, symbol.selectionRange.end) :
				new vscode.Selection(symbol.selectionRange.end, rangeEnd);
		}
	} else if (blockMode === "Indentation") {
		blockScope = await findOuterIndentation(textEditor, before, near, pos);
	} else { console.assert(blockMode === "None", `Unknown Block Scope Mode ${blockMode}.`); }
	// If one scope includes the other, pick the nearer target, otherwise pick the farther target.
	let result = null;
	if (blockScope && bracketScope) {
		if (bracketScope.contains(blockScope) || (near && isNearer(before, blockScope.active, bracketScope.active))) {
			result = blockScope.active;
		} else {
			result = bracketScope.active;
		}
	} else if (blockScope) {
		result = blockScope.active;
	} else if (bracketScope) {
		result = bracketScope.active;
	}
	if (!result) {
		textEditor.selection = savedSelection;
		if (state.leftVisibleRange) {
			textEditor.revealRange(state.lastVisibleRange);
		}
		return;
	}
	const maybeBracketOverride = await findBracketScopeOverPos(textEditor, before, result);
	if (maybeBracketOverride && (!blockScope || !maybeBracketOverride.contains(blockScope)) &&
		(!bracketScope || !maybeBracketOverride.contains(bracketScope))) {
		result = maybeBracketOverride.active;
	}
	const anchor = select ? savedSelection.anchor : result;
	textEditor.selection = new vscode.Selection(anchor, result);
	if (!state.lastVisibleRange.contains(textEditor.selection)) {
		textEditor.revealRange(textEditor.selection);
	} else if (state.leftVisibleRange) {
		textEditor.revealRange(state.lastVisibleRange);
	}
}

/** Finds the bracket scope to skip over, if any. The active position is the target to skip to.
 */
async function findSiblingBracket(
	textEditor: vscode.TextEditor, raw: boolean, before: boolean, pos: vscode.Position,
): Promise<vscode.Selection | null> {
	const doc = textEditor.document;
	const direction = before ? -1 : 1;
	const lastOffset = doc.offsetAt(doc.validatePosition(new vscode.Position(doc.lineCount, 1)));
	const incrIsClosing = before ? true : false;
	// `nesting` and `updated` only used when raw is true.
	let nesting = 0;
	let updated = false;
	// TODO(9): this is convoluted, maybe refactor/simplify.
	let jumpPos = null;
	let lookingAtJump = null;
	for (let offset = doc.offsetAt(pos); 0 <= offset && offset <= lastOffset; offset += direction) {
		const offsetPos = doc.positionAt(offset);
		// \r\n endline.
		if (doc.offsetAt(offsetPos) !== offset) { continue; }
		if (before && offsetPos.character === 0) {
			continue;
		}
		// const lookingAtMM = oneOfAtPoint(doc, DelimiterType.markmacs, true, before, offsetPos);
		// if (lookingAtMM) {
		// 	offset += (lookingAtMM.length - 1) * direction;
		// 	continue;
		// }
		const lookingAtIncr =
			oneOfAtPoint(doc, incrIsClosing ? DelimiterType.closing : DelimiterType.opening, raw, before, offsetPos);
		const lookingAtDecr =
			oneOfAtPoint(doc, incrIsClosing ? DelimiterType.opening : DelimiterType.closing, raw, before, offsetPos);
		const isIncr = lookingAtIncr && (!lookingAtDecr || lookingAtIncr.length > lookingAtDecr.length);
		if (isIncr) {
			const lookingAtIncrPos = offsetPos.translate(0, Math.min(direction * lookingAtIncr.length, 0));
			if (raw) {
				if (!updated) { jumpPos = lookingAtIncrPos; lookingAtJump = lookingAtIncr; }
				++nesting; updated = true; offset += direction * (lookingAtIncr.length - 1);
			} else {
				// Check whether it is a real delimiter vs. e.g. in a comment.
				let targetPos = await jumpToBracket(textEditor, lookingAtIncrPos);
				if (isNearer(before, targetPos, lookingAtIncrPos)) {
					continue;
				}
				if (targetPos.isEqual(lookingAtIncrPos)) {
					// No bracket scopes left to the right.
					if (before) { continue; } else { return null; }
				}
				// Verify it was an active delimiter by backjumping.
				jumpPos = await jumpToBracket(textEditor, targetPos);
				if (jumpPos.isEqual(lookingAtIncrPos)) {
					targetPos = before ? targetPos : targetPos.translate(0, 1);
					const entryPos = before ? jumpPos.translate(0, lookingAtIncr.length) : jumpPos;
					return new vscode.Selection(entryPos, targetPos);
				}
			}
		} else if (lookingAtDecr) {
			const lookingAtDecrPos = offsetPos.translate(0, Math.min(direction * lookingAtDecr.length, 0));
			if (raw) {
				--nesting; updated = true;
				if (nesting === 0) {
					if (!jumpPos || !lookingAtJump) {
						console.assert(false, 'findSiblingBracket anchor not initialized.');
						return null;
					}
					const entryPos = before ? jumpPos.translate(0, lookingAtJump.length) : jumpPos;
					return new vscode.Selection(entryPos, offsetPos.translate(0, direction * lookingAtDecr.length));
				}
				offset += direction * (lookingAtDecr.length - 1);
			} else {
				// Verify it is an active outer scope delimiter. If yes, bail out.
				const endJump = await jumpToBracket(textEditor, lookingAtDecrPos);
				if (endJump.isEqual(lookingAtDecrPos)) {
					// No bracket scopes left to the right. No need to back-jump, it's not a valid delimiter.
					if (before) { continue; } else { return null; }
				}
				if (before) {
					const backJump = await jumpToBracket(textEditor, endJump);
					if (backJump.isEqual(lookingAtDecrPos)) { return null; }
				} else {
					if (endJump.isBefore(offsetPos)) { return null; }
				}
			}
		}
		if (updated && nesting < 0) { return null; }
	}
	return null;
}

/** Like findSiblingBracket, but for indentation blocks. Note that it can return a scope that strictly
 *  includes the point (due to the "wide delimiters" view of indentation scopes).
 * 
 * Empty lines surrounding a scope are treated as "not belonging to any scope", which is inelegant
 * formally, but leads to better navigation experience. */
function findSiblingIndentation(
	textEditor: vscode.TextEditor, before: boolean, pos: vscode.Position): vscode.Selection | null {
	const doc = textEditor.document;
	const direction = before ? -1 : 1;
	let noIndent = -1;
	let entryNo = -1;
	let updated = false;
	let passingEmptyLine = false;
	// Note: there is an assymetry between the `-1` and `1` directions, because an indentation scope starts
	// with an undindented line and ends with an indented line!
	for (let lineNo = pos.line; 0 <= lineNo && lineNo < doc.lineCount; lineNo += direction) {
		const line = doc.lineAt(lineNo);
		if (line.isEmptyOrWhitespace && lineNo < doc.lineCount - 1 && lineNo > 0) {
			// Special treatment so that navigation does not get stuck by entering a scope next to a
			// skipped-over scope.
			passingEmptyLine = true;
			continue;
		}
		// Note: indentation is different than `firstNonWhitespaceCharacterIndex`.
		const indentation = countVisibleIndentation(textEditor, line);
		if (noIndent < 0) {
			noIndent = indentation;
		}
		else if (updated && indentation === noIndent) {
			const entryPos = before ? doc.lineAt(entryNo).range.end : new vscode.Position(entryNo, noIndent);
			const previousLinePos = doc.lineAt(lineNo - direction).range.end;
			const leavePos = passingEmptyLine ? previousLinePos :
				new vscode.Position(lineNo, line.firstNonWhitespaceCharacterIndex);
			return new vscode.Selection(entryPos, leavePos);
		} else if (!updated && indentation > noIndent) {
			updated = true;
			if (before) {
				entryNo = lineNo;
			} else {
				entryNo = lineNo - direction;
			}
		} else if (indentation < noIndent) { return null; }
		passingEmptyLine = false;
	}
	return null;
}

export async function goPastSiblingScope(textEditor: vscode.TextEditor, select: boolean, before: boolean) {
	// State update might interact with the UI, save UI state early.
	const savedSelection = textEditor.selection;
	let state = await updateStateForPosition(textEditor);
	const configuration = vscode.workspace.getConfiguration();
	const blockMode = configuration.get<string>("navi-parens.blockScopeMode");
	const pos = savedSelection.active;
	let blockScope: vscode.Selection | null = null;
	let scopeLimit: vscode.Range | null = null;
	if (blockMode === "Semantic") {
		const stack = state.lastSymbolAndAncestors;
		// First, find a defined-symbol candidate, if any.
		const siblingSymbols = stack.length > 0 ? stack[stack.length - 1].children : state.rootSymbols;
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
		if (stack.length > 0) {
			scopeLimit = stack[stack.length - 1].range;
		}
		if (candidate) {
			blockScope = before ? new vscode.Selection(candidate.end, candidate.start) :
				new vscode.Selection(candidate.start, candidate.end);
		}
	} else if (blockMode === "Indentation") {
		blockScope = await findSiblingIndentation(textEditor, before, pos);
		scopeLimit = await findOuterIndentation(textEditor, before, false, pos);
	} else { console.assert(blockMode === "None", `Unknown Block Scope Mode ${blockMode}.`); }

	const bracketsMode = vscode.workspace.getConfiguration().get<string>("navi-parens.bracketScopeMode");
	let bracketScope = bracketsMode === "None" ? null :
		await findSiblingBracket(textEditor, bracketsMode === "Raw", before, pos);

	let bracketsLimit = bracketsMode === "JumpToBracket" ? await findOuterBracket(textEditor, before, pos) :
		bracketsMode === "Raw" ? findOuterBracketRaw(textEditor, before, pos, /*useSeparators=*/false) : null;
	if (bracketsLimit) {
		scopeLimit = scopeLimit ? (scopeLimit.intersection(bracketsLimit) ?? null) : bracketsLimit;
	}

	if (blockScope && scopeLimit && !scopeLimit.contains(blockScope)) {
		blockScope = null;
	}
	if (bracketScope && scopeLimit && !scopeLimit.intersection(bracketScope)) {
		bracketScope = null;
	}

	let targetPos = null;
	if (blockScope && bracketScope &&
		!blockScope.anchor.isEqual(pos) && blockScope.contains(pos) &&
		blockScope.intersection(bracketScope) !== undefined) {
		targetPos = bracketScope.active;
	} else if (blockScope && bracketScope) {
		if (blockScope.intersection(bracketScope) !== undefined) {
			targetPos = isNearer(before, blockScope.active, bracketScope.active) ? bracketScope.active : blockScope.active;
		} else {
			targetPos = isNearer(before, blockScope.active, bracketScope.active) ? blockScope.active : bracketScope.active;
		}
	} else if (blockScope) {
		targetPos = blockScope.active;
	} else if (bracketScope) {
		targetPos = bracketScope.active;
	}

	if (!targetPos) {
		textEditor.selection = savedSelection;
		if (state.leftVisibleRange) {
			textEditor.revealRange(state.lastVisibleRange);
		}
		return;
	}
	const maybeBracketOverride = await findBracketScopeOverPos(textEditor, before, targetPos);
	if (maybeBracketOverride && (!blockScope || !maybeBracketOverride.contains(blockScope)) &&
		(!bracketScope || !maybeBracketOverride.contains(bracketScope))) {
		targetPos = maybeBracketOverride.active;
	}
	const anchor = select ? savedSelection.anchor : targetPos;
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
	if (!targetPos) {
		targetPos = before ? doc.validatePosition(doc.positionAt(0))
			: doc.validatePosition(doc.lineAt(doc.lineCount - 1).range.end);
	}
	const anchor = select ? textEditor.selection.anchor : targetPos;
	textEditor.selection = new vscode.Selection(anchor, targetPos);
	textEditor.revealRange(textEditor.selection);
}

export async function goPastWord(textEditor: vscode.TextEditor, select: boolean, before: boolean) {
	const doc = textEditor.document;
	const pos = textEditor.selection.active;
	const direction = before ? -1 : 1;
	const regexStr = vscode.workspace.getConfiguration().get<string>('navi-parens.pastWordRegex');
	assert(regexStr, 'Missing setting navi-parens.pastWordRegex');
	if (!regexStr) { return; }
	const wordCharRegex = new RegExp(regexStr, 'gu');
	let targetPos = null;
	let previouslyLookingAt = null;
	let previousOffsetPos = null;
	const lastOffset = doc.offsetAt(doc.validatePosition(new vscode.Position(doc.lineCount, 0)));
	for (let offset = doc.offsetAt(pos); 0 <= offset && offset <= lastOffset; offset += direction) {
		let offsetPos = doc.positionAt(offset);
		// Beginning-of-line and end-of-line cases.
		while ((previousOffsetPos && offsetPos.isEqual(previousOffsetPos)) ||
			(offsetPos.character === 0 && direction === -1)) {
			offset += direction;
			if (offset < 0 || offset > lastOffset ||
				(previouslyLookingAt && previouslyLookingAt.match(wordCharRegex))) {
				targetPos = offsetPos;
				break;
			}
			offsetPos = doc.positionAt(offset);
		}
		if (targetPos) { break; }
		let lookingAtPos = offsetPos.translate(0, Math.min(direction, 0));
		const lookingAt = characterAtPoint(doc, lookingAtPos);
		if (previouslyLookingAt && previouslyLookingAt.match(wordCharRegex) && !lookingAt.match(wordCharRegex)) {
			targetPos = offsetPos;
			break;
		}
		previouslyLookingAt = lookingAt;
		previousOffsetPos = offsetPos;
	}
	if (!targetPos || !previouslyLookingAt || !previouslyLookingAt.match(wordCharRegex)) { return; }
	const anchor = select ? textEditor.selection.anchor : targetPos;
	textEditor.selection = new vscode.Selection(anchor, targetPos);
	textEditor.revealRange(textEditor.selection);
}

export async function goPastCharacter(textEditor: vscode.TextEditor, select: boolean, before: boolean) {
	const doc = textEditor.document;
	let pos = textEditor.selection.active;
	const direction = before ? -1 : 1;
	// const lookingAtMM = oneOfAtPoint(doc, DelimiterType.markmacs, true, before, pos);
	// if (lookingAtMM) {
	// 	pos = doc.positionAt(doc.offsetAt(pos) + lookingAtMM.length * direction);
	// }
	const lookingAt = oneOfAtPoint(doc, DelimiterType.jointDelimiters, true, before, pos);
	let targetPos = null;
	if (lookingAt) {
		targetPos = pos.translate(0, direction * lookingAt.length);
	} else {
		targetPos = doc.positionAt(doc.offsetAt(pos) + direction);
		if (pos.isEqual(targetPos)) {
			targetPos = doc.positionAt(doc.offsetAt(pos) + (direction * 2));
		}
	}
	if (!targetPos) { return; }
	const anchor = select ? textEditor.selection.anchor : targetPos;
	textEditor.selection = new vscode.Selection(anchor, targetPos);
	textEditor.revealRange(textEditor.selection);
}

/** Go to a position within the `oneLinerMin` -- `oneLinerMax` offset range. */
export async function goOneLiner(textEditor: vscode.TextEditor, select: boolean, before: boolean) {
	const savedSelection = textEditor.selection;
	let state = await updateStateForPosition(textEditor);
	const configuration = vscode.workspace.getConfiguration();
	const oneLinerMin = configuration.get<number>("navi-parens.oneLinerMin");
	const pos = savedSelection.active;
	const bracketScope = findOuterBracketRaw(textEditor, before, pos, /*useSeparators=*/true, oneLinerMin);
	if (!bracketScope) {
		return;
	}
	const result = bracketScope.active;
	const anchor = select ? savedSelection.anchor : result;
	textEditor.selection = new vscode.Selection(anchor, result);
	if (!state.lastVisibleRange.contains(textEditor.selection)) {
		textEditor.revealRange(textEditor.selection);
	} else if (state.leftVisibleRange) {
		textEditor.revealRange(state.lastVisibleRange);
	}

}

function updateStatusBarItem(
	blockScopeMode: string | undefined, bracketScopeMode: string | undefined, isMarkmacsMode: boolean | undefined
): void {
	const blockMode = blockScopeMode === 'Semantic' ? 'SEM' :
		(blockScopeMode === 'Indentation' ? 'IND' : (blockScopeMode === 'None' ? 'NON' : '---'));
	const bracketMode = bracketScopeMode === 'JumpToBracket' ? 'JTB' :
		(bracketScopeMode === 'Raw' ? 'RAW' : (bracketScopeMode === 'None' ? 'NON' : '---'));
	naviStatusBarItem.text = `Navi: ${blockMode}/${bracketMode}${isMarkmacsMode ? '/MM' : ''}`;
	naviStatusBarItem.show();
}

function configurationChangeUpdate(event: vscode.ConfigurationChangeEvent) {
	const configuration = vscode.workspace.getConfiguration();
	const closingBracketsRaw = configuration.get<string[]>("navi-parens.closingBracketsRaw") || [];
	if (event.affectsConfiguration('navi-parens.closingBracketsRaw')) {
		if (closingBracketsRaw.length > 0) {
			closingBeforeRawRegex = makeRegExp('(' + escapeRegExps(closingBracketsRaw) + ')$');
			closingAfterRawRegex = makeRegExp('^(' + escapeRegExps(closingBracketsRaw) + ')');
			closingRawMaxLength = Math.max(...closingBracketsRaw.map(delim => delim.length));
		}
	}
	const openingBracketsRaw = configuration.get<string[]>("navi-parens.openingBracketsRaw") || [];
	if (event.affectsConfiguration('navi-parens.openingBracketsRaw')) {
		if (openingBracketsRaw.length > 0) {
			openingBeforeRawRegex = makeRegExp('(' + escapeRegExps(openingBracketsRaw) + ')$');
			openingAfterRawRegex = makeRegExp('^(' + escapeRegExps(openingBracketsRaw) + ')');
			openingRawMaxLength = Math.max(...openingBracketsRaw.map(delim => delim.length));
		}
	}
	const separatorsMM = configuration.get<string[]>("navi-parens.separatorsMM") || [];
	if (event.affectsConfiguration('navi-parens.separatorsMM')) {
		if (separatorsMM.length > 0) {
			separatorsMMBeforeRawRegex = makeRegExp('(' + escapeRegExps(separatorsMM) + ')$');
			separatorsMMAfterRawRegex = makeRegExp('^(' + escapeRegExps(separatorsMM) + ')');
		}
	}
	const separatorsNoMM = configuration.get<string[]>("navi-parens.separatorsNoMM") || [];
	if (event.affectsConfiguration('navi-parens.separatorsNoMM')) {
		if (separatorsNoMM.length > 0) {
			separatorsNoMMBeforeRawRegex = makeRegExp('(' + escapeRegExps(separatorsNoMM) + ')$');
			separatorsNoMMAfterRawRegex = makeRegExp('^(' + escapeRegExps(separatorsNoMM) + ')');
		}
	}
	if (
		event.affectsConfiguration('navi-parens.pseudoSeparatorMM') ||
		event.affectsConfiguration('navi-parens.separatorsMM') ||
		event.affectsConfiguration('navi-parens.openingBracketsRaw') ||
		event.affectsConfiguration('navi-parens.closingBracketsRaw')
	) {
		const pseudoSepMM = configuration.get<string>("navi-parens.pseudoSeparatorMM");
		if (pseudoSepMM && pseudoSepMM.length > 0) {
			pseudoSepMMBeforeRawRegex = makeRegExp('(' + pseudoSepMM + ')$');
			pseudoSepMMAfterRawRegex = makeRegExp('^(' + pseudoSepMM + ')');
		} else {
			pseudoSepMMBeforeRawRegex = noMatchRegex;
			pseudoSepMMAfterRawRegex = noMatchRegex;
		}
	}
	if (
		event.affectsConfiguration('navi-parens.pseudoSeparatorNoMM') ||
		event.affectsConfiguration('navi-parens.separatorsNoMM') ||
		event.affectsConfiguration('navi-parens.openingBracketsRaw') ||
		event.affectsConfiguration('navi-parens.closingBracketsRaw')
	) {
		const pseudoSepNoMM = configuration.get<string>("navi-parens.pseudoSeparatorNoMM");
		if (pseudoSepNoMM && pseudoSepNoMM.length > 0) {
			pseudoSepNoMMBeforeRawRegex = makeRegExp('(' + pseudoSepNoMM + ')$');
			pseudoSepNoMMAfterRawRegex = makeRegExp('^(' + pseudoSepNoMM + ')');
		} else {
			pseudoSepNoMMBeforeRawRegex = noMatchRegex;
			pseudoSepNoMMAfterRawRegex = noMatchRegex;
		}
	}
	if (event.affectsConfiguration('navi-parens.blockScopeMode') ||
		event.affectsConfiguration('navi-parens.bracketScopeMode') ||
		event.affectsConfiguration('navi-parens.isMarkmacsMode')
	) {
		updateStatusBarItem(configuration.get<string>('navi-parens.blockScopeMode'),
			configuration.get<string>('navi-parens.bracketScopeMode'),
			configuration.get<boolean>('navi-parens.isMarkmacsMode'));
	}
}

function markmacsRange(doc: vscode.TextDocument, pos: vscode.Position): vscode.Range | null {
	return null;
}

// async function removeCursorMarkers(textEditor: vscode.TextEditor) {
// 	const doc = textEditor.document;
// 	let cursor = doc.offsetAt(textEditor.selection.active);
// 	let anchor = doc.offsetAt(textEditor.selection.anchor);
// 	for (const light of [true, false]) {
// 		const delim = light ? markmacsEndLightTheme : markmacsEndDarkTheme;
// 		const text = doc.getText();
// 		let atPos = text.length;
// 		let lastPos = null;
// 		while ((atPos = text.lastIndexOf(delim, atPos - 1)) >= 0) {
// 			const pos = doc.positionAt(atPos);
// 			lastPos = pos;
// 			// The cursor adapts to edits, there's no need to re-position it.
// 			await textEditor.edit(
// 				(edit: vscode.TextEditorEdit) =>
// 					edit.replace(new vscode.Range(pos, doc.positionAt(atPos + delim.length)), ''));
// 			{
// 				const delim = light ? markmacsMidLightTheme : markmacsMidDarkTheme;
// 				const matched = text.lastIndexOf(delim, atPos);
// 				if (matched >= 0) {
// 					await textEditor.edit(
// 						(edit: vscode.TextEditorEdit) =>
// 							edit.replace(new vscode.Range(doc.positionAt(matched), doc.positionAt(matched + delim.length)), ''));
// 				}
// 			}
// 			{
// 				const delim = light ? markmacsBegLightTheme : markmacsBegDarkTheme;
// 				const matched = text.lastIndexOf(delim, atPos);
// 				if (matched >= 0) {
// 					await textEditor.edit(
// 						(edit: vscode.TextEditorEdit) =>
// 							edit.replace(new vscode.Range(doc.positionAt(matched), doc.positionAt(matched + delim.length)), ''));
// 				}
// 			}
// 		}
// 	}
// }

// async function addCursorMarker(
// 	textEditor: vscode.TextEditor, begPos: vscode.Position, endPos: vscode.Position
// ) {
// 	const doc = textEditor.document;
// 	const beg = doc.offsetAt(begPos);
// 	const end = doc.offsetAt(endPos);
// 	let anchor = doc.offsetAt(textEditor.selection.anchor);
// 	const mid = doc.offsetAt(textEditor.selection.active);
// 	if (mid < beg || end < mid) {
// 		return;
// 	}
// 	await textEditor.edit((edit: vscode.TextEditorEdit) => edit.insert(doc.positionAt(end), markmacsEnd));
// 	await textEditor.edit((edit: vscode.TextEditorEdit) => edit.insert(doc.positionAt(mid), markmacsMid));
// 	await textEditor.edit((edit: vscode.TextEditorEdit) => edit.insert(doc.positionAt(beg), markmacsBeg));
// 	// Reposition the cursor to be before the inserted markmacsMid.
// 	let anchorTo = anchor;
// 	if (anchor >= beg) {
// 		anchorTo += markmacsBeg.length;
// 	}
// 	let posTo = mid;
// 	if (mid >= beg) {
// 		posTo += markmacsBeg.length;
// 	}
// 	if (anchor > mid) {
// 		anchorTo += markmacsMid.length;
// 	}
// 	if (anchor > end) {
// 		anchorTo += markmacsEnd.length;
// 	}
// 	if (mid > end) {
// 		posTo += markmacsEnd.length;
// 	}
// 	textEditor.selection = new vscode.Selection(atPosition(doc, posTo), atPosition(doc, anchorTo));
// }

function isMarkmacsMode(): boolean {
	const configuration = vscode.workspace.getConfiguration();
	const mm = configuration.get<boolean>("navi-parens.isMarkmacsMode");
	return mm === undefined ? false : mm;
}

async function toggleMarkmacsMode(textEditor: vscode.TextEditor) {
	const configuration = vscode.workspace.getConfiguration();
	const isMarkmacsMode = !configuration.get<boolean>("navi-parens.isMarkmacsMode");
	await configuration.update("navi-parens.isMarkmacsMode", isMarkmacsMode,
		vscode.ConfigurationTarget.Global, true);
	// if (isMarkmacsMode) {
	// 	lastUpdatedPosition = null;
	// 	await markmacsUpdate(textEditor);
	// } else {
	// 	await removeCursorMarkers(textEditor);
	// }
}

async function cycleBracketScopeMode(_textEditor: vscode.TextEditor) {
	const configuration = vscode.workspace.getConfiguration();
	const bracketsMode = configuration.get<string>("navi-parens.bracketScopeMode");
	let newMode = bracketsMode === "None" ? "JumpToBracket" : (
		bracketsMode === "JumpToBracket" ? "Raw" : (bracketsMode === "Raw" ? "None" : null)
	);
	if (!newMode) {
		console.assert(false, `Unknown setting for navi-parens.bracketScopeMode: ${bracketsMode}.`);
		newMode = "None";
	}
	await configuration.update("navi-parens.bracketScopeMode", newMode,
		vscode.ConfigurationTarget.Global, true);
}

async function cycleBlockScopeMode(_textEditor: vscode.TextEditor) {
	const configuration = vscode.workspace.getConfiguration();
	const blocksMode = configuration.get<string>("navi-parens.blockScopeMode");
	let newMode = blocksMode === "None" ? "Semantic" : (
		blocksMode === "Semantic" ? "Indentation" : (blocksMode === "Indentation" ? "None" : null)
	);
	if (!newMode) {
		console.assert(false, `Unknown setting for navi-parens.blockScopeMode: ${blocksMode}.`);
		newMode = "None";
	}
	await configuration.update("navi-parens.blockScopeMode", newMode,
		vscode.ConfigurationTarget.Global, true);
}

export function activate(context: vscode.ExtensionContext) {
	console.log('Congratulations, the extension "navi-parens" is being activated!');

	const configuration = vscode.workspace.getConfiguration();
	vscode.workspace.onDidChangeConfiguration(configurationChangeUpdate);
	// vscode.window.onDidChangeTextEditorSelection((event: vscode.TextEditorSelectionChangeEvent) =>
	// 	markmacsUpdate(event.textEditor));

	vscode.workspace.onDidChangeTextDocument(event => {
		const uri = event.document.uri;
		const state = documentStates.get(uri);
		if (state) { state.needsUpdate = true; }
	}, null, context.subscriptions);

	// vscode.window.onDidChangeActiveColorTheme(() => {
	// 	isCurrentThemeLight =
	// 		vscode.window.activeColorTheme.kind === 1 /* Light */ ||
	// 		vscode.window.activeColorTheme.kind === 4 /* HighContrastLight */;
	// });

	function newCommand(
		command: string, callback: (textEditor: vscode.TextEditor, ...args: any[]) => void
	) {
		context.subscriptions.push(vscode.commands.registerTextEditorCommand(command, callback));
	}

	newCommand('navi-parens.goPastNextScope', textEditor => goPastSiblingScope(textEditor, false, false));
	newCommand('navi-parens.goPastPreviousScope', textEditor => goPastSiblingScope(textEditor, false, true));
	newCommand('navi-parens.selectPastNextScope', textEditor => goPastSiblingScope(textEditor, true, false));
	newCommand('navi-parens.selectPastPreviousScope', textEditor => goPastSiblingScope(textEditor, true, true));
	newCommand('navi-parens.goToUpScope', textEditor => goToOuterScope(textEditor, false, true, false, false));
	newCommand('navi-parens.goToDownScope', textEditor => goToOuterScope(textEditor, false, false, false, false));
	newCommand('navi-parens.selectToUpScope', textEditor => goToOuterScope(textEditor, true, true, false, false));
	newCommand('navi-parens.selectToDownScope', textEditor => goToOuterScope(textEditor, true, false, false, false));
	newCommand('navi-parens.goUpOneLiner', textEditor => goOneLiner(textEditor, false, true));
	newCommand('navi-parens.goDownOneLiner', textEditor => goOneLiner(textEditor, false, false));
	newCommand('navi-parens.selectUpOneLiner', textEditor => goOneLiner(textEditor, true, true));
	newCommand('navi-parens.selectDownOneLiner', textEditor => goOneLiner(textEditor, true, false));
	newCommand('navi-parens.goToBeginScope', textEditor => goToOuterScope(textEditor, false, true, true, false));
	newCommand('navi-parens.goToEndScope', textEditor => goToOuterScope(textEditor, false, false, true, false));
	newCommand('navi-parens.selectToBeginScope', textEditor => goToOuterScope(textEditor, true, true, true, false));
	newCommand('navi-parens.selectToEndScope', textEditor => goToOuterScope(textEditor, true, false, true, false));
	newCommand('navi-parens.goBeginScopeOrArg', textEditor => goToOuterScope(textEditor, false, true, true, true));
	newCommand('navi-parens.goEndScopeOrArg', textEditor => goToOuterScope(textEditor, false, false, true, true));
	newCommand('navi-parens.selectBeginScopeOrArg', textEditor => goToOuterScope(textEditor, true, true, true, true));
	newCommand('navi-parens.selectEndScopeOrArg', textEditor => goToOuterScope(textEditor, true, false, true, true));
	newCommand('navi-parens.cycleBracketScopeMode', cycleBracketScopeMode);
	newCommand('navi-parens.cycleBlockScopeMode', cycleBlockScopeMode);
	newCommand('navi-parens.goToPreviousEmptyLine', textEditor => goToEmptyLine(textEditor, false, true));
	newCommand('navi-parens.goToNextEmptyLine', textEditor => goToEmptyLine(textEditor, false, false));
	newCommand('navi-parens.goPastPreviousWord', textEditor => goPastWord(textEditor, false, true));
	newCommand('navi-parens.goPastNextWord', textEditor => goPastWord(textEditor, false, false));
	newCommand('navi-parens.selectToPreviousEmptyLine', textEditor => goToEmptyLine(textEditor, true, true));
	newCommand('navi-parens.selectToNextEmptyLine', textEditor => goToEmptyLine(textEditor, true, false));
	newCommand('navi-parens.selectPastPreviousWord', textEditor => goPastWord(textEditor, true, true));
	newCommand('navi-parens.selectPastNextWord', textEditor => goPastWord(textEditor, true, false));
	newCommand('navi-parens.toggleMarkmacsMode', toggleMarkmacsMode);
	newCommand('navi-parens.goLeftOverDelims', textEditor => goPastCharacter(textEditor, false, true));
	newCommand('navi-parens.goRightOverDelims', textEditor => goPastCharacter(textEditor, false, false));
	newCommand('navi-parens.selectLeftOverDelims', textEditor => goPastCharacter(textEditor, true, true));
	newCommand('navi-parens.selectRightOverDelims', textEditor => goPastCharacter(textEditor, true, false));

	// Register a command that is invoked when the status bar item is selected
	const naviCommandId = 'navi-parens.showScopeModes';
	context.subscriptions.push(vscode.commands.registerCommand(naviCommandId, () => {
		const configuration = vscode.workspace.getConfiguration();
		vscode.window.showInformationMessage('Navi Parens: ' +
			configuration.get<string>('navi-parens.blockScopeMode') + '/' +
			configuration.get<string>('navi-parens.bracketScopeMode') +
			(configuration.get<boolean>('navi-parens.isMarkmacsMode') ? '/MarkmacsMode' : '') +
			' (`ctrl+shift+alt+p` changes block scope mode / ' +
			'`ctrl+alt+p` changes bracket scope mode / `ctrl+alt+m` changes Markmacs mode).');
	}));
	// Create a new status bar item.
	naviStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
	naviStatusBarItem.command = naviCommandId;
	context.subscriptions.push(naviStatusBarItem);
	updateStatusBarItem(configuration.get<string>('navi-parens.blockScopeMode'),
		configuration.get<string>('navi-parens.bracketScopeMode'),
		configuration.get<boolean>('navi-parens.isMarkmacsMode'));
}

export function deactivate() { }

// And just some parting (parenthesized) comments.