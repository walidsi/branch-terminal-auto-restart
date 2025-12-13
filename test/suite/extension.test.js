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

	test('Executing the command should be callable', async () => {
		// Verify the command exists and can be executed without errors
		// In a real test environment, we would spy on the tryRestartUsingGitApiOnce function
		// to verify it's called when the command is executed, but this requires more complex
		// module mocking that's difficult to set up in this extension test environment
		
		const commands = await vscode.commands.getCommands(true);
		const commandExists = commands.includes('branchTerminal.restartManually');
		
		assert.ok(commandExists, 'Command should be registered');
		
		// Execute the command to ensure it runs without errors
		try {
			await vscode.commands.executeCommand('branchTerminal.restartManually');
			assert.ok(true, 'Command executed without throwing an error');
		} catch (error) {
			assert.fail(`Command threw an error: ${error.message}`);
		}
	});
});
