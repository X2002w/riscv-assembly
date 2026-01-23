import * as vscode from 'vscode';


export class registerProvider implements vscode.TreeDataProvider<RegisterItem> {
	getTreeItem(element: RegisterItem): vscode.TreeItem | Thenable<vscode.TreeItem> {
		return element;
	}

	getChildren(element?: RegisterItem): vscode.ProviderResult<RegisterItem[]> {
		return [];
	}
}

export class RegisterItem extends vscode.TreeItem {
	constructor(
		public readonly label: string,
		public readonly collapsibleState: vscode.TreeItemCollapsibleState
	) {
		super(label, collapsibleState);
	}
}