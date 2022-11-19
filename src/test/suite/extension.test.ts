import * as assert from 'assert';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
// import * as myExtension from '../../extension';

function charactersAround(doc: vscode.TextDocument, pos: vscode.Position): string {
	return doc.getText(new vscode.Range(
		doc.positionAt(doc.offsetAt(pos) - 2), doc.positionAt(doc.offsetAt(pos) + 2)));
}

async function openFileWithCursor(annotated: string): Promise<{
	textEditor: vscode.TextEditor,
	targetPos: vscode.Position
}> {
	let source = annotated.indexOf('@');
	let target = annotated.indexOf('^');
	if (source < target) { --target; } else {	--source;	}
	let content = annotated.replace('@', '').replace('^', '');
	const doc = await vscode.workspace.openTextDocument({
		language: 'typescript', content,
	});
	const sourcePos = doc.positionAt(source);
	const targetPos = doc.positionAt(target);
	const textEditor = await vscode.window.showTextDocument(doc);
	textEditor.selection = new vscode.Selection(sourcePos, sourcePos);
	return { textEditor, targetPos };
}

function testCase(content: string, command: string) {
	return async () => {
		const { textEditor, targetPos } = await openFileWithCursor(content);
		await vscode.commands.executeCommand(command);
		assert.deepStrictEqual(targetPos, textEditor.selection.active);
	};
}

suite('Extension Test Suite', () => {
	vscode.window.showInformationMessage('Start all tests.');
	// TODO: enable symbol providers -- debug why they don't work in tests.
	vscode.workspace.getConfiguration().update("navi-parens.symbolProvider", "None",
		vscode.ConfigurationTarget.Global, true);
	test('Basic parentheses navigation: up from between parens', testCase(
		`(^(@()))`,
		'navi-parens.goToUpScope'
	));
	test('Basic parentheses navigation: down from between parens', testCase(
		`((@())^)`,
		'navi-parens.goToDownScope'
	));
	test('Basic parentheses navigation: up no-change', testCase(
		`(((@^)))`,
		'navi-parens.goToUpScope'
	));
	test('Basic parentheses navigation: down no-change', testCase(
		`((()))@^`,
		'navi-parens.goToDownScope'
	));
	test('Basic parentheses navigation: left no-change', testCase(
		`((^@()))`,
		'navi-parens.goPastPreviousScope'
	));
	test('Basic parentheses navigation: right no-change', testCase(
		`((^@()))`,
		'navi-parens.goPastNextScope'
	));
	test('Basic parentheses navigation: left', testCase(
		`(^(())@)`,
		'navi-parens.goPastPreviousScope'
	));
	test('Basic parentheses navigation: right', testCase(
		`(@(())^)`,
		'navi-parens.goPastNextScope'
	));
});
