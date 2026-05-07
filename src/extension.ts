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
        vscode.window.showInformationMessage(`Copied ${item.register.name}: ${item.register.currentValue}`);
      }
    }),

    // 切换"仅显示已修改"
    vscode.commands.registerCommand('riscv-register.toggleShowChanged', () => {
      registerProvider.toggleShowChangedOnly();
    }),

    // 循环切换显示进制: 十进制 → 十六进制 → 二进制
    vscode.commands.registerCommand('riscv-register.cycleDisplayBase', () => {
      registerProvider.cycleDisplayBase();
    })
  ];
  
  // 将所有命令添加到订阅
  commands.forEach(command => context.subscriptions.push(command));
  
  // 监听文档编辑变化 — 实时更新到光标所在行
  vscode.workspace.onDidChangeTextDocument(event => {
    if (isRiscVFile(event.document)) {
      const editor = vscode.window.activeTextEditor;
      if (editor && editor.document === event.document) {
        const line = editor.selection.active.line + 1;
        registerProvider.updateToLine(event.document, line);
      }
    }
  });

  // 监听文档保存 — 根据配置决定是否重置寄存器
  vscode.workspace.onDidSaveTextDocument(document => {
    if (isRiscVFile(document)) {
      const config = vscode.workspace.getConfiguration('asmRegisterViewer');
      const shouldSaveReset = config.get<boolean>('saveReset', false);
      if (shouldSaveReset) {
        registerProvider.resetRegisters();
        const editor = vscode.window.activeTextEditor;
        if (editor && editor.document === document) {
          const line = editor.selection.active.line + 1;
          registerProvider.updateToLine(document, line);
        }
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
  
  // 监听活动编辑器变化 | 文件/语言类型变化
  vscode.window.onDidChangeActiveTextEditor(editor => {
    if (editor) {
      const config = vscode.workspace.getConfiguration('asmRegisterViewer');
      const shouldAutoReset = config.get<boolean>('autoReset', true);
      if (isRiscVFile(editor.document)) {
        if (shouldAutoReset && registerProvider.getLastDocumentType() !== editor.document.languageId) {
          registerProvider.resetRegisters();
        }
        const line = editor.selection.active.line + 1;
        registerProvider.updateToLine(editor.document, line);
      }
      registerProvider.updateLastDocumentType(editor.document);
    }
  });
}
 

  // 检查是否是 RISC-V 文件
function isRiscVFile(document: vscode.TextDocument): boolean {
  //vscode.window.showInformationMessage(`Checking file type for: ${document.fileName}\n Language ID: ${document.languageId}`);
  return document.languageId === 'riscv-assembly' || 
         document.fileName.endsWith('.s') ||
         document.fileName.endsWith('.S');
} 

export function deactivate() {}