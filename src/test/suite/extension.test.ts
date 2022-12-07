import * as assert from 'assert';

import * as vscode from 'vscode';
import * as myExtension from '../../extension';

function charactersAround(doc: vscode.TextDocument, pos: vscode.Position): string {
	return doc.getText(new vscode.Range(
		doc.positionAt(doc.offsetAt(pos) - 2), doc.positionAt(doc.offsetAt(pos) + 2)));
}

async function openFileWithCursor(annotated: string, language: string): Promise<{
	textEditor: vscode.TextEditor,
	targetPos: vscode.Position
}> {
	let source = annotated.indexOf('@');
	let target = annotated.indexOf('^');
	if (source < target) { --target; } else {	--source;	}
	let content = annotated.replace('@', '').replace('^', '');
	const doc = await vscode.workspace.openTextDocument({language, content});
	const sourcePos = doc.positionAt(source);
	const targetPos = doc.positionAt(target);
	// When debugging, to enable charactersAround in watch expressions. 
	// const debug1 = charactersAround(doc, sourcePos);
	const textEditor = await vscode.window.showTextDocument(doc);
	textEditor.selection = new vscode.Selection(sourcePos, sourcePos);
	return { textEditor, targetPos };
}

function getAnnotatedContent(textEditor: vscode.TextEditor, sourcePos: vscode.Position): string {
	const doc = textEditor.document;
	const source = doc.offsetAt(sourcePos);
	const target = doc.offsetAt(textEditor.selection.active);
	let content = textEditor.document.getText();
	if (source < target) {
		content = content.slice(0, source) + '@' + content.slice(source, target) + '^' + content.slice(target);
	} else {
		content = content.slice(0, target) + '^' + content.slice(target, source) + '@' + content.slice(source);
	}
	return content;
}

const isDebugSession = false;

function testCase(content: string, command: string, mode: string, language: string, debugThis?: boolean | undefined) {
	if ((isDebugSession && !debugThis) || (!isDebugSession && debugThis)) { return; }
	return async () => {
		const { textEditor, targetPos } = await openFileWithCursor(content, language);
		const sourcePos = textEditor.selection.active;
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
		// TODO(2): enable symbol providers -- perhaps add mocks.
		const modes = new Map([
			['IND/JTB', ['Indentation', 'JumpToBracket']],
			['IND/RAW', ['Indentation', 'Raw']],
			['NON/JTB', ['None', 'JumpToBracket']],
			['NON/RAW', ['None', 'Raw']],
			['IND/NON', ['Indentation', 'None']]
		]);
		const modePair = modes.get(mode);
		assert.notStrictEqual(modePair, undefined);
		if (!modePair) { return; }
		const [blockMode, bracketMode] = modePair;
		vscode.workspace.getConfiguration().update("navi-parens.blockScopeMode", blockMode,
			vscode.ConfigurationTarget.Global, true);
			vscode.workspace.getConfiguration().update("navi-parens.bracketScopeMode", bracketMode,
			vscode.ConfigurationTarget.Global, true);
		// We cannot use vscode.commands.executeCommand because that creates a different TextEditor.
		const action = commands.get(command);
		assert.notStrictEqual(action, undefined);
		if (!action) { return; }
		await action();
		const result = getAnnotatedContent(textEditor, sourcePos);
		// assert.deepEqual(result, content)
		assert.deepStrictEqual(textEditor.selection.active, targetPos, result);
	};
}

suite('Extension Test Suite', () => {
	vscode.window.showInformationMessage('Start all tests.');
	for (const mode of ['IND/RAW', 'IND/JTB']) {
		// Basics.
		test('Basic parentheses navigation: up from between parens ' + mode, testCase(
			`(^(@()))`,
			'goToUpScope', mode, 'typescript'
		));
		test('Basic parentheses navigation: down from between parens ' + mode, testCase(
			`((@())^)`,
			'goToDownScope', mode, 'typescript'
		));
		test('Basic parentheses navigation: up no-change ' + mode, testCase(
			`^@((()))`,
			'goToUpScope', mode, 'typescript'
		));
		test('Basic parentheses navigation: down no-change ' + mode, testCase(
			`((()))@^`,
			'goToDownScope', mode, 'typescript'
		));
		test('Basic parentheses navigation: left no-change ' + mode, testCase(
			`((^@()))`,
			'goPastPreviousScope', mode, 'typescript'
		));
		test('Basic parentheses navigation: right no-change ' + mode, testCase(
			`((()@^))`,
			'goPastNextScope', mode, 'typescript'
		));
		test('Basic parentheses navigation: left ' + mode, testCase(
			`(^(())@)`,
			'goPastPreviousScope', mode, 'typescript'
		));
		test('Basic parentheses navigation: right ' + mode, testCase(
			`(@(())^)`,
			'goPastNextScope', mode, 'typescript'
		));
		test('Basic parentheses navigation: beginning from between parens ' + mode, testCase(
			`((^()@()))`,
			'goToBeginScope', mode, 'typescript'
		));
		test('Basic parentheses navigation: end from between parens ' + mode, testCase(
			`((()@()^))`,
			'goToEndScope', mode, 'typescript'
		));
		test('Basic parentheses navigation: beginning no-change ' + mode, testCase(
			`((^@()))`,
			'goToBeginScope', mode, 'typescript'
		));
		test('Basic parentheses navigation: end no-change ' + mode, testCase(
			`((()@^))`,
			'goToEndScope', mode, 'typescript'
		));
		));
	}
});
