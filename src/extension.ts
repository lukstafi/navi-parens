import * as vscode from 'vscode';

interface DocumentNavigationState {
  /** Cache for the symbol trees for the whole document. Lazily populated, cleared on a document change. */
	symbols: vscode.DocumentSymbol[] | null;
	/** A stack of ancestor symbols with the current symbol at position 0. */
	currentSymbolZipper: vscode.DocumentSymbol[] | null;
}
let documentStates = new Map<vscode.Uri, DocumentNavigationState>();

export function activate(context: vscode.ExtensionContext) {

	console.log('Congratulations, your extension "navi-parens" is being activated!');

	function newCommand(command: string, callback: (textEditor: vscode.TextEditor, edit: vscode.TextEditorEdit, ...args: any[]) => void) {
		context.subscriptions.push(vscode.commands.registerTextEditorCommand(command, callback));
	}
	newCommand('navi-parens.goToNextBracket', goToNextBracket);
	newCommand('navi-parens.goToPreviousBracket', goToPreviousBracket);
}

export function deactivate() {}

async function goToNextBracket(textEditor: vscode.TextEditor, edit: vscode.TextEditorEdit, ...args: any[]) {
	let pos = textEditor.selection.active;
	console.log('For now, debug info at position: %d, %d', pos.line, pos.character);
	await printDocumentSymbols(textEditor.document);
}

async function goToPreviousBracket(textEditor: vscode.TextEditor, edit: vscode.TextEditorEdit, ...args: any[]) {
	let pos = textEditor.selection.active;
	console.log('For now, debug info at position: %d, %d', pos.line, pos.character);
	await printRangeSemanticTokens(textEditor.document, textEditor.selection);
}

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
		console.log('%s%s: %s (is string? %s)', ' '.repeat(indent), symbol.name, symbol.detail, (symbol.kind === vscode.SymbolKind.String));
		console.log('%sChildren:', ' '.repeat(indent));
		printSymbols(symbol.children, indent+1);
	}
}

async function printRangeSemanticTokens(doc: vscode.TextDocument, range: vscode.Range) {
	let cancel = new vscode.CancellationTokenSource();
	let tokens = await vscode.commands.executeCommand<vscode.SemanticTokens>('vscode.provideDocumentRangeSemanticTokens', doc.uri, range,	cancel);
	let legend = await vscode.commands.executeCommand<vscode.SemanticTokensLegend>('vscode.provideDocumentRangeSemanticTokensLegend', doc.uri, range,	cancel);
	if (tokens === undefined || legend === undefined) {
		console.log('No tokens in the range.');
		return;
	}
	console.log('Range tokens:');
	let numTokens = tokens.data.length / 5;
	var line = 0;
	var column = 0;
	for (var i = 0; i < numTokens; ++i) {
		let deltaLine = tokens.data[i*5];
		let deltaStartChar = tokens.data[i*5+1];
		let tokenLen = tokens.data[i*5+2];
		let tokenType = legend.tokenTypes[tokens.data[i*5+3]];

		line += deltaLine;
		if (deltaLine == 0) {
			column = deltaStartChar;
		} else {
			column += deltaStartChar;
		}
		console.log('  %d,%d+%d: %s', line, column, tokenLen, tokenType);
	}
}