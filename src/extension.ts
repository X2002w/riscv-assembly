import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {

  let extension_start_log: string = 'riscv assembly extension is now active!';
  console.log(extension_start_log);

  vscode.window.showInformationMessage(extension_start_log);
    
}