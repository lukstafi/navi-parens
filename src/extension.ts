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
}
let documentStates = new Map<vscode.Uri, DocumentNavigationState>();

/** From Navi Parens perspective, positions on the border of a scope are outside of the scope. */
function containsInside(range: vscode.Range, pos: vscode.Position): boolean {
	return range.contains(pos) && !range.start.isEqual(pos) && !range.end.isEqual(pos);
}

async function updateStateForPosition(textEditor: vscode.TextEditor): Promise<DocumentNavigationState> {
	const uri = textEditor.document.uri;
	const pos = textEditor.selection.active;
	let state = documentStates.get(uri);
	if (!state) {
		state = {needsUpdate: true, rootSymbols: [], lastSymbolAndAncestors: [], lastBracketScope: null, lastPosition: pos};
		documentStates.set(uri, state);
	}
	if (state.needsUpdate) {
		state.rootSymbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>('vscode.executeDocumentSymbolProvider', uri);
		state.lastSymbolAndAncestors = [];
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
	// It would be great to use 'editor.action.selectToBracket' but that flashes a selection in the UI.
	await vscode.commands.executeCommand('editor.action.jumpToBracket');
	let endSelection = textEditor.selection.active;
	await vscode.commands.executeCommand('editor.action.jumpToBracket');
	let startSelection = textEditor.selection.active; /*(()(()(())))   ()    ()*/
	if (startSelection.isAfter(endSelection)) {
		// Touching the outer bracket.
		[startSelection, endSelection] = [endSelection, startSelection];
	}
	if (startSelection.isAfterOrEqual(pos)) {
		// Semantics mismatch -- right-adjacent scope selected.
		// Note: `textEditor.selection.active = pos.translate(0, -1);` doesn't work.
		// For comparison (would probably be slower):
		// await vscode.commands.executeCommand('cursorMove', {to: 'left', by: 'character', select: false, value: 1});
		textEditor.selection = new vscode.Selection(savedSelection.anchor, pos.translate(0, -1));
		await vscode.commands.executeCommand('editor.action.jumpToBracket');
		endSelection = textEditor.selection.active;
		await vscode.commands.executeCommand('editor.action.jumpToBracket');
		startSelection = textEditor.selection.active;
		if (startSelection.isAfter(endSelection)) {
			[startSelection, endSelection] = [endSelection, startSelection];
		}
		}
	while (endSelection.isBefore(pos)) {
		// If we run too far, `containsInside` below will be false, so OK.
		textEditor.selection = new vscode.Selection(savedSelection.anchor, textEditor.selection.active.translate(0, -1));
		await vscode.commands.executeCommand('editor.action.jumpToBracket');
		endSelection = textEditor.selection.active;
		await vscode.commands.executeCommand('editor.action.jumpToBracket');
		startSelection = textEditor.selection.active;
		if (startSelection.isAfter(endSelection)) {
			[startSelection, endSelection] = [endSelection, startSelection];
		}
	}
	// Select past the outer bracket.
	// TODO: support mulit-character tokens.
	const bracketRange = new vscode.Range(startSelection, endSelection.translate(0, 1));
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
	textEditor.revealRange(textEditor.selection);
}

async function goPastSiblingScope(textEditor: vscode.TextEditor, select: boolean, before: boolean) {
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
	let gap;
	if (candidate) {
		gap = before ? new vscode.Range(candidate.end, pos) : new vscode.Range(pos, candidate.start);
	} else {
		let invalidRange = new vscode.Range(0, 0, textEditor.document.lineCount, 0);
		let fullRange = textEditor.document.validateRange(invalidRange);
		gap = before ? new vscode.Range(fullRange.start, pos) : new vscode.Range(pos, fullRange.end);
	}
	const gapText = textEditor.document.getText(gap);
	const bracketTriggers = before ? [")", "]", "}", ">"] : ["(", "[", "{", "<"]
	function bracketOffset(last: number) {
		const f = (b: string) => before ? gapText.lastIndexOf(b, last) :  gapText.indexOf(b, last);
		const indices: number[] = bracketTriggers.map(f).filter(idx => idx > 0);
		if (indices.length == 0) { return -1; }
		return before ? Math.max(...indices) : Math.min(...indices);
	}
	let last = before ? gapText.length - 1 : 0;
	while (true) {
		last = bracketOffset(last);
		if (last != -1) { break; }
		
	}

	if (!candidate) {
		// If no progress, optionally shift to higher scope.
		// TODO: optionally but by default.
		if (stack.length > 0) {
			stack.pop();
			await goPastSiblingScope(textEditor, select, before);
		}
		return;
	}
	const cursor = before ? candidate.start : candidate.end;
	const anchor = select ? textEditor.selection.anchor : cursor;
	textEditor.selection = new vscode.Selection(anchor, cursor);
	textEditor.revealRange(textEditor.selection);
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
