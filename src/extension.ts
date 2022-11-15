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
			if (child.range.contains(pos)) {
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

	// TODO: compute
	state.lastBracketScope = null;

	return state;
}

async function goToOuterScope(textEditor: vscode.TextEditor, select: boolean, point: (r: vscode.Range) => vscode.Position) {
	let state = await updateStateForPosition(textEditor);
	let currentSymbol = state.lastSymbolAndAncestors.pop();
	if (!currentSymbol) {
		return;
	}
	const cursor = point(currentSymbol.range);
	if (cursor.isEqual(textEditor.selection.active)) {
		// No progress, try again. This time `updateStateForPosition` will do nothing, and we will pop another symbol from the stack.
		await goToOuterScope(textEditor, select, point);
		return;
	}
	const anchor = select ? textEditor.selection.anchor : cursor;
	textEditor.selection = new vscode.Selection(anchor, cursor);
}

async function goPastSiblingScope(textEditor: vscode.TextEditor, select: boolean, point: (r: vscode.Range) => vscode.Position) {
	let oldSelection = textEditor.selection;
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

	newCommand('navi-parens.goPastNextScope', textEditor => goPastSiblingScope(textEditor, false, r => r.start));
	newCommand('navi-parens.goPastPreviousScope', textEditor => goPastSiblingScope(textEditor, false, r => r.end));
	newCommand('navi-parens.selectPastNextScope', textEditor => goPastSiblingScope(textEditor, true, r => r.start));
	newCommand('navi-parens.selectPastPreviousScope', textEditor => goPastSiblingScope(textEditor, true, r => r.end));
	newCommand('navi-parens.goToUpScope', textEditor => goToOuterScope(textEditor, false, r => r.start));
	newCommand('navi-parens.goToDownScope', textEditor => goToOuterScope(textEditor, false, r => r.end));
	newCommand('navi-parens.selectToUpScope', textEditor => goToOuterScope(textEditor, true, r => r.start));
	newCommand('navi-parens.selectToDownScope', textEditor => goToOuterScope(textEditor, true, r => r.end));
}

export function deactivate() {}
