import * as assert from 'assert';

import * as vscode from 'vscode';
import * as myExtension from '../../extension';

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
	const debug1 = charactersAround(doc, sourcePos);
	const textEditor = await vscode.window.showTextDocument(doc);
	textEditor.selection = new vscode.Selection(sourcePos, sourcePos);
	return { textEditor, targetPos };
}

function testCase(content: string, command: string) {
	return async () => {
		const { textEditor, targetPos } = await openFileWithCursor(content);
		const commands = new Map(Object.entries({
			'goPastNextScope': () => myExtension.goPastSiblingScope(textEditor, false, false),
			'goPastPreviousScope': () => myExtension.goPastSiblingScope(textEditor, false, true),
			'selectPastNextScope': () => myExtension.goPastSiblingScope(textEditor, true, false),
			'selectPastPreviousScope': () => myExtension.goPastSiblingScope(textEditor, true, true),
			'goToUpScope': () => myExtension.goToOuterScope(textEditor, false, true, false),
			'goToDownScope': () => myExtension.goToOuterScope(textEditor, false, false, false),
			'selectToUpScope': () => myExtension.goToOuterScope(textEditor, true, true, false),
			'selectToDownScope': () => myExtension.goToOuterScope(textEditor, true, false, false),
			'goToBeginScope': () => myExtension.goToOuterScope(textEditor, false, true, true),
			'goToEndScope': () => myExtension.goToOuterScope(textEditor, false, false, true),
			'selectToBeginScope': () => myExtension.goToOuterScope(textEditor, true, true, false),
			'selectToEndScope': () => myExtension.goToOuterScope(textEditor, true, false, false)
		}));
		// We cannot use vscode.commands.executeCommand because that creates a different TextEditor.
		const action = commands.get(command);
		assert.notStrictEqual(action, undefined);
		if (!action) { return; }
		await action();
		assert.deepStrictEqual(textEditor.selection.active, targetPos);
	};
}

suite('Extension Test Suite', () => {
	vscode.window.showInformationMessage('Start all tests.');
	// TODO(2): enable symbol providers -- debug why they don't work in tests.
	vscode.workspace.getConfiguration().update("navi-parens.blockScopeMode", "None",
		vscode.ConfigurationTarget.Global, true);
	test('Basic parentheses navigation: up from between parens', testCase(
		`(^(@()))`,
		'goToUpScope'
	));
	// FIXME(1): past-the-delimiter regression
	// test('Basic parentheses navigation: down from between parens', testCase(
	// 	`((@())^)`,
	// 	'goToDownScope'
	// ));
	test('Basic parentheses navigation: up no-change', testCase(
		`^@((()))`,
		'goToUpScope'
	));
	test('Basic parentheses navigation: down no-change', testCase(
		`((()))@^`,
		'goToDownScope'
	));
	test('Basic parentheses navigation: left no-change', testCase(
		`((^@()))`,
		'goPastPreviousScope'
	));
	test('Basic parentheses navigation: right no-change', testCase(
		`((()@^))`,
		'goPastNextScope'
	));
	test('Basic parentheses navigation: left', testCase(
		`(^(())@)`,
		'goPastPreviousScope'
	));
	test('Basic parentheses navigation: right', testCase(
		`(@(())^)`,
		'goPastNextScope'
	));
	test('Basic parentheses navigation: beginning from between parens', testCase(
		`((^()@()))`,
		'goToBeginScope'
	));
	// FIXME(1): past-the-delimiter regression also broke Go To End Scope
	// test('Basic parentheses navigation: end from between parens', testCase(
	// 	`((()@()^))`,
	// 	'goToEndScope'
	// ));
	test('Basic parentheses navigation: beginning no-change', testCase(
		`((^@()))`,
		'goToBeginScope'
	));
	test('Basic parentheses navigation: end no-change', testCase(
		`((()@^))`,
		'goToEndScope'
	));
});
