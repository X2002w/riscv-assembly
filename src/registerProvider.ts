import * as vscode from 'vscode';
import { RegisterState, asmParser } from './asmParser';



export class RegisterItem extends vscode.TreeItem {

	constructor (
		public readonly label: string,
		public readonly collapsibleState: vscode.TreeItemCollapsibleState,	
		public readonly register?: RegisterState
	) {
		super(label, collapsibleState);
		if (register) {
			this.description = register.currentValue;
			this.tooltip = this.getTooltip();

			if (register.changed) {
				this.iconPath = new vscode.ThemeIcon('circle-filled');
			}

			this.contextValue = 'register';
		}
	}

	
	private getTooltip(): string {
		if (!this.register) {
			return this.label;
		}
	return 'Name: ${this.register.name}\n' + 
					 'Value: ${this.register.currentValue}\n' +
					 'Type: ${this.register.type}\n' +
					 'Bits: ${this.register.bits}\n' +
					 'Changed: ${this.register.changed}\n';
	}

}

export class RegisterProvider implements vscode.TreeDataProvider<RegisterItem> {
	private _onDidChangeTreeData = new vscode.EventEmitter<RegisterItem | undefined | void>();
	readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

	private parser: asmParser;
	private showChangedOnly: boolean = false;

	private lastDocumentType: string | undefined = undefined;

	constructor() {
		this.parser = new asmParser();
	}

	refresh(): void {
		this._onDidChangeTreeData.fire();
	}

	toggleShowChangedOnly(): void {
		this.showChangedOnly = !this.showChangedOnly;
		this.refresh();
	}

	resetRegisters(): void {
		this.parser.reset();
		this.refresh();
	}

	// 更新到指定行
	updateToLine(document: vscode.TextDocument, line: number): void {
		const text = document.getText();
		this.parser.parseToLine(text, line);
		this.refresh();
	}

	// TreeDateProvider 接口实现
	getTreeItem(element: RegisterItem): vscode.TreeItem {
		return element;
	}

	getChildren(element?: RegisterItem): vscode.ProviderResult<RegisterItem[]> {
		if (!element) {
			return this.getAllRegistersNodes();
		}
		return [];
	}

	private getAllRegistersNodes(): RegisterItem[] {
		const registers = Array.from(this.parser.getRegisterStates().values());
		const items: RegisterItem[] = [];

		const typeOrder = ['pc', 'special', 'save', 'temp'];

		typeOrder.forEach(type => {
			registers
			.filter(reg => reg.type === type)
			.filter(reg => !this.showChangedOnly || reg.changed)
			.forEach(reg => {
				const alias = this.getRegisterAlias(reg.name);
				const label = alias ? `${alias} (${reg.name})` : reg.name;

				items.push(new RegisterItem(
					label,
					vscode.TreeItemCollapsibleState.None,
					reg
				));
			});
		});
		return items;
	}
	// 获取寄存器别名
  private getRegisterAlias(name: string): string {
    const aliases: Record<string, string> = {
      'zero': 'x0', 'ra': 'x1', 'sp': 'x2', 'gp': 'x3', 'tp': 'x4',
      't0': 'x5', 't1': 'x6', 't2': 'x7', 's0': 'x8', 's1': 'x9',
      'a0': 'x10', 'a1': 'x11', 'a2': 'x12', 'a3': 'x13',
      'a4': 'x14', 'a5': 'x15', 'a6': 'x16', 'a7': 'x17',
      's2': 'x18', 's3': 'x19', 's4': 'x20', 's5': 'x21',
      's6': 'x22', 's7': 'x23', 's8': 'x24', 's9': 'x25',
      's10': 'x26', 's11': 'x27', 't3': 'x28', 't4': 'x29',
      't5': 'x30', 't6': 'x31'
    };
    return aliases[name] || '';
  }
	updateLastDocumentType(document: vscode.TextDocument): void {
		this.lastDocumentType = document.languageId;
	}
	getLastDocumentType(): string | undefined {
		return this.lastDocumentType;
	}
}


		