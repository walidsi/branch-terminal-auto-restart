const assert = require('assert');

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
const vscode = require('vscode');

suite('Extension Test Suite', () => {
	vscode.window.showInformationMessage('Start all tests.');

	test('Extension should be present', () => {
		assert.ok(vscode.extensions.getExtension('WalidIsmail.branch-terminal-auto-restart'));
	});

	test('Command palette command should be registered', async () => {
		const commands = await vscode.commands.getCommands(true);
		const commandExists = commands.includes('branchTerminal.restartManually');
		assert.ok(commandExists, 'The command branchTerminal.restartManually should be registered');
	});

	test('Executing the command should not throw an error', async () => {
		// Execute the command - it should complete without throwing
		await vscode.commands.executeCommand('branchTerminal.restartManually');
		// If we reach this point without error, the command executed successfully
		assert.ok(true, 'Command executed without throwing an error');
	});
});
