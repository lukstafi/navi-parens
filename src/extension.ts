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
		console.log('Update symbols for doc: %s -- at position %d, %d', uri, pos.line, pos.character);
		state.rootSymbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>('vscode.executeDocumentSymbolProvider', uri);
		state.lastSymbolAndAncestors = [];
		state.needsUpdate = false;
	} else if (pos.isEqual(state.lastPosition)) {
		return state;
	}
	console.log('Update state for doc: %s -- at position %d, %d', uri, pos.line, pos.character);

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

async function goToUpScope(textEditor: vscode.TextEditor, edit: vscode.TextEditorEdit, ...args: any[]) {
	let pos = textEditor.selection.active;
	console.log('goToUpScope for doc %s -- at position: %d, %d', textEditor.document.uri, pos.line, pos.character);
	// await printDocumentSymbols(textEditor.document);
	let state = await updateStateForPosition(textEditor);
	let currentSymbol = state.lastSymbolAndAncestors.pop();
	if (currentSymbol) {
		textEditor.selection = new vscode.Selection(currentSymbol.range.start, currentSymbol.range.start);
	}
}

async function selectToUpScope(textEditor: vscode.TextEditor, edit: vscode.TextEditorEdit, ...args: any[]) {
	let pos = textEditor.selection.active;
	console.log('goToUpScope for doc %s -- at position: %d, %d', textEditor.document.uri, pos.line, pos.character);
	// await printDocumentSymbols(textEditor.document);
	let state = await updateStateForPosition(textEditor);
	let currentSymbol = state.lastSymbolAndAncestors.pop();
	if (currentSymbol) {
		textEditor.selection = new vscode.Selection(textEditor.selection.anchor, currentSymbol.range.start);
	}
}

async function goToDownScope(textEditor: vscode.TextEditor, edit: vscode.TextEditorEdit, ...args: any[]) {
	let pos = textEditor.selection.active;
	console.log('goToDownScope for doc %s -- at position: %d, %d', textEditor.document.uri, pos.line, pos.character);
	// await printDocumentSymbols(textEditor.document);
	let state = await updateStateForPosition(textEditor);
	let currentSymbol = state.lastSymbolAndAncestors.pop();
	if (currentSymbol) {
		textEditor.selection = new vscode.Selection(currentSymbol.range.end, currentSymbol.range.end);
	}
}

async function selectToDownScope(textEditor: vscode.TextEditor, edit: vscode.TextEditorEdit, ...args: any[]) {
	let pos = textEditor.selection.active;
	console.log('goToDownScope for doc %s -- at position: %d, %d', textEditor.document.uri, pos.line, pos.character);
	// await printDocumentSymbols(textEditor.document);
	let state = await updateStateForPosition(textEditor);
	let currentSymbol = state.lastSymbolAndAncestors.pop();
	if (currentSymbol) {
		textEditor.selection = new vscode.Selection(textEditor.selection.anchor, currentSymbol.range.end);
	}
}

async function goPastNextScope(textEditor: vscode.TextEditor, edit: vscode.TextEditorEdit, ...args: any[]) {
	let pos = textEditor.selection.active;
	console.log('goPastNextScope doc %s -- debug at position: %d, %d', textEditor.document.uri, pos.line, pos.character);
	await printDocumentSymbols(textEditor.document);
}

async function goPastPreviousScope(textEditor: vscode.TextEditor, edit: vscode.TextEditorEdit, ...args: any[]) {
	let pos = textEditor.selection.active;
	console.log('goPastNextScope doc %s -- debug at position: %d, %d', textEditor.document.uri, pos.line, pos.character);
	await printDocumentSymbols(textEditor.document);
}

export function activate(context: vscode.ExtensionContext) {

	console.log('Congratulations, your extension "navi-parens" is being activated!');

	vscode.workspace.onDidChangeTextDocument(event => {
		const uri = event.document.uri;
		console.log('Change in doc: %s', uri);
		const state = documentStates.get(uri);
		if (state) { state.needsUpdate = true; }
	}, null, context.subscriptions);

	function newCommand(command: string, callback: (textEditor: vscode.TextEditor, edit: vscode.TextEditorEdit, ...args: any[]) => void) {
		context.subscriptions.push(vscode.commands.registerTextEditorCommand(command, callback));
	}

	newCommand('navi-parens.goPastNextScope', goPastNextScope);
	newCommand('navi-parens.goPastPreviousScope', goPastPreviousScope);
	newCommand('navi-parens.goToUpScope', goToUpScope);
	newCommand('navi-parens.goToDownScope', goToDownScope);
	newCommand('navi-parens.selectToUpScope', selectToUpScope);
	newCommand('navi-parens.selectToDownScope', selectToDownScope);
}

export function deactivate() {}

async function printDocumentSymbols(doc: vscode.TextDocument) {
	let symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>('vscode.executeDocumentSymbolProvider', doc.uri);
	if (symbols === undefined) {
		console.log('No symbols in the document.');
		return;
	}
	console.log('All symbols:');
	printSymbols(symbols, 1);
}

function printSymbols(symbols: vscode.DocumentSymbol[], indent: number) {	
	for(let symbol of symbols) {
		console.log('%s%s: <%d,%d>--<%d,%d> %s', ' '.repeat(indent*4), symbol.name, symbol.range.start.line, symbol.range.start.character, 
			symbol.range.end.line, symbol.range.end.character, symbol.detail);
		if (symbol.children.length > 0) {
			console.log('%sChildren:', ' '.repeat(indent*4));
			printSymbols(symbol.children, indent + 1);
		}
	}
}
