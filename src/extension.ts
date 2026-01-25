import * as vscode from 'vscode';
import { RegisterProvider, RegisterItem } from './registerProvider';


export function activate(context: vscode.ExtensionContext) {

  console.log('Assembly extension is activating...');

  const registerProvider = new RegisterProvider();

  const treeView = vscode.window.createTreeView('asmRegisterViewer', {
    treeDataProvider: registerProvider,
    showCollapseAll: true
  })
  context.subscriptions.push(treeView);
  
  // 注册所有命令
  const commands = [
    // 从编辑器上下文菜单显示寄存器
    vscode.commands.registerCommand('asmRegisterViewer.showRegisters', () => {
      // 确保侧边栏视图可见
      vscode.commands.executeCommand('asmRegisterViewer.focus');
      
      // 更新寄存器状态
      const editor = vscode.window.activeTextEditor;
      if (editor && isRiscVFile(editor.document)) {
        const line = editor.selection.active.line + 1;
        registerProvider.updateToLine(editor.document, line);
      } else {
        vscode.window.showInformationMessage('Please open a RISC-V assembly file first.');
      }
    }),
    
    // 重置所有寄存器
    vscode.commands.registerCommand('asmRegisterViewer.reset', () => {
      registerProvider.resetRegisters();
      vscode.window.showInformationMessage('All registers reset');
    }),
    
    // 复制寄存器值
    vscode.commands.registerCommand('asmRegisterViewer.copyValue', (item: RegisterItem) => {
      if (item && item.register) {
        vscode.env.clipboard.writeText(item.register.currentValue);
        vscode.window.showInformationMessage(`Copied: ${item.register.currentValue}`);
      }
    })
  ];
  
  // 将所有命令添加到订阅
  commands.forEach(command => context.subscriptions.push(command));
  
  // 监听文档变化
  vscode.workspace.onDidChangeTextDocument(event => {
    if (isRiscVFile(event.document)) {
      const editor = vscode.window.activeTextEditor;
      if (editor && editor.document === event.document) {
        const line = editor.selection.active.line + 1;
        registerProvider.updateToLine(event.document, line);
      }
    }
  });
  
  // 监听光标位置变化
  vscode.window.onDidChangeTextEditorSelection(event => {
    if (event.textEditor && isRiscVFile(event.textEditor.document)) {
      const line = event.selections[0].active.line + 1;
      registerProvider.updateToLine(event.textEditor.document, line);
    }
  });
  
  // 监听活动编辑器变化
  vscode.window.onDidChangeActiveTextEditor(editor => {
    if (editor && isRiscVFile(editor.document)) {
      const line = editor.selection.active.line + 1;
      registerProvider.updateToLine(editor.document, line);
    }
  });
}
 

  // 检查是否是 RISC-V 文件
function isRiscVFile(document: vscode.TextDocument): boolean {
  return document.languageId === 'riscv-assembly' || 
         document.fileName.endsWith('.s') ||
         document.fileName.endsWith('.S');
} 

export function deactivate() {}