import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { RegisterProvider, RegisterItem } from './registerProvider';

interface SnippetDefinition {
  prefix: string;
  body: string[];
  description: string;
}

// ── 全指令集定义 ────────────────────────────────────────────────

interface InstructionDef {
  mnemonic: string;
  /** Snippet 模板，不含 mnemonic 本身，例如 "${1:rd}, ${2:rs1}, ${3:rs2}" */
  operands: string;
  description: string;
}

const RV32I_R: InstructionDef[] = [
  { mnemonic: 'add',   operands: '${1:rd}, ${2:rs1}, ${3:rs2}', description: 'R-type: add rd, rs1, rs2' },
  { mnemonic: 'sub',   operands: '${1:rd}, ${2:rs1}, ${3:rs2}', description: 'R-type: sub rd, rs1, rs2' },
  { mnemonic: 'sll',   operands: '${1:rd}, ${2:rs1}, ${3:rs2}', description: 'R-type: sll rd, rs1, rs2 (shift left logical)' },
  { mnemonic: 'slt',   operands: '${1:rd}, ${2:rs1}, ${3:rs2}', description: 'R-type: slt rd, rs1, rs2 (set less than)' },
  { mnemonic: 'sltu',  operands: '${1:rd}, ${2:rs1}, ${3:rs2}', description: 'R-type: sltu rd, rs1, rs2 (set less than unsigned)' },
  { mnemonic: 'xor',   operands: '${1:rd}, ${2:rs1}, ${3:rs2}', description: 'R-type: xor rd, rs1, rs2' },
  { mnemonic: 'srl',   operands: '${1:rd}, ${2:rs1}, ${3:rs2}', description: 'R-type: srl rd, rs1, rs2 (shift right logical)' },
  { mnemonic: 'sra',   operands: '${1:rd}, ${2:rs1}, ${3:rs2}', description: 'R-type: sra rd, rs1, rs2 (shift right arithmetic)' },
  { mnemonic: 'or',    operands: '${1:rd}, ${2:rs1}, ${3:rs2}', description: 'R-type: or rd, rs1, rs2' },
  { mnemonic: 'and',   operands: '${1:rd}, ${2:rs1}, ${3:rs2}', description: 'R-type: and rd, rs1, rs2' },
];

const RV32I_I: InstructionDef[] = [
  { mnemonic: 'addi',  operands: '${1:rd}, ${2:rs1}, ${3:imm}', description: 'I-type: addi rd, rs1, imm' },
  { mnemonic: 'slti',  operands: '${1:rd}, ${2:rs1}, ${3:imm}', description: 'I-type: slti rd, rs1, imm' },
  { mnemonic: 'sltiu', operands: '${1:rd}, ${2:rs1}, ${3:imm}', description: 'I-type: sltiu rd, rs1, imm' },
  { mnemonic: 'xori',  operands: '${1:rd}, ${2:rs1}, ${3:imm}', description: 'I-type: xori rd, rs1, imm' },
  { mnemonic: 'ori',   operands: '${1:rd}, ${2:rs1}, ${3:imm}', description: 'I-type: ori rd, rs1, imm' },
  { mnemonic: 'andi',  operands: '${1:rd}, ${2:rs1}, ${3:imm}', description: 'I-type: andi rd, rs1, imm' },
];

const RV32I_SHIFT: InstructionDef[] = [
  { mnemonic: 'slli',  operands: '${1:rd}, ${2:rs1}, ${3:shamt}', description: 'I-type shift: slli rd, rs1, shamt' },
  { mnemonic: 'srli',  operands: '${1:rd}, ${2:rs1}, ${3:shamt}', description: 'I-type shift: srli rd, rs1, shamt' },
  { mnemonic: 'srai',  operands: '${1:rd}, ${2:rs1}, ${3:shamt}', description: 'I-type shift: srai rd, rs1, shamt' },
];

const RV32I_LOAD: InstructionDef[] = [
  { mnemonic: 'lb',   operands: '${1:rd}, ${2:0}(${3:rs1})', description: 'I-type load: lb rd, offset(rs1) — byte signed' },
  { mnemonic: 'lh',   operands: '${1:rd}, ${2:0}(${3:rs1})', description: 'I-type load: lh rd, offset(rs1) — halfword signed' },
  { mnemonic: 'lw',   operands: '${1:rd}, ${2:0}(${3:rs1})', description: 'I-type load: lw rd, offset(rs1) — word' },
  { mnemonic: 'lbu',  operands: '${1:rd}, ${2:0}(${3:rs1})', description: 'I-type load: lbu rd, offset(rs1) — byte unsigned' },
  { mnemonic: 'lhu',  operands: '${1:rd}, ${2:0}(${3:rs1})', description: 'I-type load: lhu rd, offset(rs1) — halfword unsigned' },
];

const RV32I_STORE: InstructionDef[] = [
  { mnemonic: 'sb',  operands: '${1:rs2}, ${2:0}(${3:rs1})', description: 'S-type: sb rs2, offset(rs1) — byte' },
  { mnemonic: 'sh',  operands: '${1:rs2}, ${2:0}(${3:rs1})', description: 'S-type: sh rs2, offset(rs1) — halfword' },
  { mnemonic: 'sw',  operands: '${1:rs2}, ${2:0}(${3:rs1})', description: 'S-type: sw rs2, offset(rs1) — word' },
];

const RV32I_BRANCH: InstructionDef[] = [
  { mnemonic: 'beq',  operands: '${1:rs1}, ${2:rs2}, ${3:label}', description: 'B-type: beq rs1, rs2, label' },
  { mnemonic: 'bne',  operands: '${1:rs1}, ${2:rs2}, ${3:label}', description: 'B-type: bne rs1, rs2, label' },
  { mnemonic: 'blt',  operands: '${1:rs1}, ${2:rs2}, ${3:label}', description: 'B-type: blt rs1, rs2, label' },
  { mnemonic: 'bge',  operands: '${1:rs1}, ${2:rs2}, ${3:label}', description: 'B-type: bge rs1, rs2, label' },
  { mnemonic: 'bltu', operands: '${1:rs1}, ${2:rs2}, ${3:label}', description: 'B-type: bltu rs1, rs2, label' },
  { mnemonic: 'bgeu', operands: '${1:rs1}, ${2:rs2}, ${3:label}', description: 'B-type: bgeu rs1, rs2, label' },
];

const RV32I_U: InstructionDef[] = [
  { mnemonic: 'lui',   operands: '${1:rd}, ${2:imm}', description: 'U-type: lui rd, imm (load upper immediate)' },
  { mnemonic: 'auipc', operands: '${1:rd}, ${2:imm}', description: 'U-type: auipc rd, imm (add upper immediate to pc)' },
];

const RV32I_J: InstructionDef[] = [
  { mnemonic: 'jal',  operands: '${1:rd}, ${2:label}', description: 'J-type: jal rd, label (jump and link)' },
  { mnemonic: 'jalr', operands: '${1:rd}, ${2:0}(${3:rs1})', description: 'I-type: jalr rd, offset(rs1) (jump and link register)' },
];

const RV32I_SYSTEM: InstructionDef[] = [
  { mnemonic: 'ecall',  operands: '', description: 'System: ecall (environment call)' },
  { mnemonic: 'ebreak', operands: '', description: 'System: ebreak (debugger breakpoint)' },
  { mnemonic: 'fence',  operands: '${1:iorw}, ${2:iorw}', description: 'System: fence pred, succ (memory ordering)' },
];

// RV64I
const RV64I: InstructionDef[] = [
  { mnemonic: 'addiw', operands: '${1:rd}, ${2:rs1}, ${3:imm}',   description: 'RV64I I-type: addiw rd, rs1, imm' },
  { mnemonic: 'slliw', operands: '${1:rd}, ${2:rs1}, ${3:shamt}', description: 'RV64I shift: slliw rd, rs1, shamt' },
  { mnemonic: 'srliw', operands: '${1:rd}, ${2:rs1}, ${3:shamt}', description: 'RV64I shift: srliw rd, rs1, shamt' },
  { mnemonic: 'sraiw', operands: '${1:rd}, ${2:rs1}, ${3:shamt}', description: 'RV64I shift: sraiw rd, rs1, shamt' },
  { mnemonic: 'addw',  operands: '${1:rd}, ${2:rs1}, ${3:rs2}',   description: 'RV64I R-type: addw rd, rs1, rs2' },
  { mnemonic: 'subw',  operands: '${1:rd}, ${2:rs1}, ${3:rs2}',   description: 'RV64I R-type: subw rd, rs1, rs2' },
  { mnemonic: 'sllw',  operands: '${1:rd}, ${2:rs1}, ${3:rs2}',   description: 'RV64I R-type: sllw rd, rs1, rs2' },
  { mnemonic: 'srlw',  operands: '${1:rd}, ${2:rs1}, ${3:rs2}',   description: 'RV64I R-type: srlw rd, rs1, rs2' },
  { mnemonic: 'sraw',  operands: '${1:rd}, ${2:rs1}, ${3:rs2}',   description: 'RV64I R-type: sraw rd, rs1, rs2' },
  { mnemonic: 'ld',    operands: '${1:rd}, ${2:0}(${3:rs1})',     description: 'RV64I load: ld rd, offset(rs1) — doubleword' },
  { mnemonic: 'lwu',   operands: '${1:rd}, ${2:0}(${3:rs1})',     description: 'RV64I load: lwu rd, offset(rs1) — word unsigned' },
  { mnemonic: 'sd',    operands: '${1:rs2}, ${2:0}(${3:rs1})',    description: 'RV64I store: sd rs2, offset(rs1) — doubleword' },
];

// M extension
const RV_M: InstructionDef[] = [
  { mnemonic: 'mul',    operands: '${1:rd}, ${2:rs1}, ${3:rs2}', description: 'M ext: mul rd, rs1, rs2' },
  { mnemonic: 'mulh',   operands: '${1:rd}, ${2:rs1}, ${3:rs2}', description: 'M ext: mulh rd, rs1, rs2 (upper 32 of 64-bit product)' },
  { mnemonic: 'mulhsu', operands: '${1:rd}, ${2:rs1}, ${3:rs2}', description: 'M ext: mulhsu rd, rs1, rs2 (signed×unsigned)' },
  { mnemonic: 'mulhu',  operands: '${1:rd}, ${2:rs1}, ${3:rs2}', description: 'M ext: mulhu rd, rs1, rs2 (unsigned upper)' },
  { mnemonic: 'div',    operands: '${1:rd}, ${2:rs1}, ${3:rs2}', description: 'M ext: div rd, rs1, rs2' },
  { mnemonic: 'divu',   operands: '${1:rd}, ${2:rs1}, ${3:rs2}', description: 'M ext: divu rd, rs1, rs2 (unsigned)' },
  { mnemonic: 'rem',    operands: '${1:rd}, ${2:rs1}, ${3:rs2}', description: 'M ext: rem rd, rs1, rs2' },
  { mnemonic: 'remu',   operands: '${1:rd}, ${2:rs1}, ${3:rs2}', description: 'M ext: remu rd, rs1, rs2 (unsigned)' },
  { mnemonic: 'mulw',   operands: '${1:rd}, ${2:rs1}, ${3:rs2}', description: 'M ext RV64: mulw rd, rs1, rs2' },
  { mnemonic: 'divw',   operands: '${1:rd}, ${2:rs1}, ${3:rs2}', description: 'M ext RV64: divw rd, rs1, rs2' },
  { mnemonic: 'remw',   operands: '${1:rd}, ${2:rs1}, ${3:rs2}', description: 'M ext RV64: remw rd, rs1, rs2' },
  { mnemonic: 'remuw',  operands: '${1:rd}, ${2:rs1}, ${3:rs2}', description: 'M ext RV64: remuw rd, rs1, rs2 (unsigned)' },
  { mnemonic: 'divuw',  operands: '${1:rd}, ${2:rs1}, ${3:rs2}', description: 'M ext RV64: divuw rd, rs1, rs2 (unsigned)' },
];

// Pseudo-instructions
const PSEUDO: InstructionDef[] = [
  { mnemonic: 'li',    operands: '${1:rd}, ${2:imm}',             description: 'Pseudo: li rd, imm (load immediate)' },
  { mnemonic: 'la',    operands: '${1:rd}, ${2:symbol}',          description: 'Pseudo: la rd, symbol (load address)' },
  { mnemonic: 'mv',    operands: '${1:rd}, ${2:rs}',              description: 'Pseudo: mv rd, rs (copy register)' },
  { mnemonic: 'not',   operands: '${1:rd}, ${2:rs}',              description: 'Pseudo: not rd, rs (bitwise NOT)' },
  { mnemonic: 'neg',   operands: '${1:rd}, ${2:rs}',              description: 'Pseudo: neg rd, rs (negate)' },
  { mnemonic: 'seqz',  operands: '${1:rd}, ${2:rs}',              description: 'Pseudo: seqz rd, rs (set if == 0)' },
  { mnemonic: 'snez',  operands: '${1:rd}, ${2:rs}',              description: 'Pseudo: snez rd, rs (set if != 0)' },
  { mnemonic: 'sltz',  operands: '${1:rd}, ${2:rs}',              description: 'Pseudo: sltz rd, rs (set if < 0)' },
  { mnemonic: 'sgtz',  operands: '${1:rd}, ${2:rs}',              description: 'Pseudo: sgtz rd, rs (set if > 0)' },
  { mnemonic: 'j',     operands: '${1:label}',                    description: 'Pseudo: j label (jump)' },
  { mnemonic: 'jr',    operands: '${1:rs}',                       description: 'Pseudo: jr rs (jump register)' },
  { mnemonic: 'ret',   operands: '',                              description: 'Pseudo: ret (return from subroutine)' },
  { mnemonic: 'call',  operands: '${1:label}',                    description: 'Pseudo: call label (call subroutine)' },
  { mnemonic: 'nop',   operands: '',                              description: 'Pseudo: nop (no operation)' },
  { mnemonic: 'sext.w', operands: '${1:rd}, ${2:rs}',             description: 'Pseudo RV64: sext.w rd, rs (sign-extend word)' },
  { mnemonic: 'beqz',  operands: '${1:rs}, ${2:label}',           description: 'Pseudo branch: beqz rs, label (branch if == 0)' },
  { mnemonic: 'bnez',  operands: '${1:rs}, ${2:label}',           description: 'Pseudo branch: bnez rs, label (branch if != 0)' },
  { mnemonic: 'blez',  operands: '${1:rs}, ${2:label}',           description: 'Pseudo branch: blez rs, label (branch if <= 0)' },
  { mnemonic: 'bgez',  operands: '${1:rs}, ${2:label}',           description: 'Pseudo branch: bgez rs, label (branch if >= 0)' },
  { mnemonic: 'bltz',  operands: '${1:rs}, ${2:label}',           description: 'Pseudo branch: bltz rs, label (branch if < 0)' },
  { mnemonic: 'bgtz',  operands: '${1:rs}, ${2:label}',           description: 'Pseudo branch: bgtz rs, label (branch if > 0)' },
];

// CSR instructions (Zicsr)
const CSR: InstructionDef[] = [
  { mnemonic: 'csrrw',  operands: '${1:rd}, ${2:csr}, ${3:rs1}', description: 'CSR: csrrw rd, csr, rs1 (read/write)' },
  { mnemonic: 'csrrs',  operands: '${1:rd}, ${2:csr}, ${3:rs1}', description: 'CSR: csrrs rd, csr, rs1 (read/set bits)' },
  { mnemonic: 'csrrc',  operands: '${1:rd}, ${2:csr}, ${3:rs1}', description: 'CSR: csrrc rd, csr, rs1 (read/clear bits)' },
  { mnemonic: 'csrrwi', operands: '${1:rd}, ${2:csr}, ${3:uimm}', description: 'CSR: csrrwi rd, csr, uimm (read/write imm)' },
  { mnemonic: 'csrrsi', operands: '${1:rd}, ${2:csr}, ${3:uimm}', description: 'CSR: csrrsi rd, csr, uimm (read/set imm)' },
  { mnemonic: 'csrrci', operands: '${1:rd}, ${2:csr}, ${3:uimm}', description: 'CSR: csrrci rd, csr, uimm (read/clear imm)' },
];

// Atomic extension (A)
const RV_A: InstructionDef[] = [
  { mnemonic: 'lr.w',         operands: '${1:rd}, (${2:rs1})',       description: 'A ext: lr.w rd, (rs1) — load reserved' },
  { mnemonic: 'sc.w',         operands: '${1:rd}, ${2:rs2}, (${3:rs1})', description: 'A ext: sc.w rd, rs2, (rs1) — store conditional' },
  { mnemonic: 'amoswap.w',    operands: '${1:rd}, ${2:rs2}, (${3:rs1})', description: 'A ext: amoswap.w rd, rs2, (rs1)' },
  { mnemonic: 'amoadd.w',     operands: '${1:rd}, ${2:rs2}, (${3:rs1})', description: 'A ext: amoadd.w rd, rs2, (rs1)' },
  { mnemonic: 'amoxor.w',     operands: '${1:rd}, ${2:rs2}, (${3:rs1})', description: 'A ext: amoxor.w rd, rs2, (rs1)' },
  { mnemonic: 'amoand.w',     operands: '${1:rd}, ${2:rs2}, (${3:rs1})', description: 'A ext: amoand.w rd, rs2, (rs1)' },
  { mnemonic: 'amoor.w',      operands: '${1:rd}, ${2:rs2}, (${3:rs1})', description: 'A ext: amoor.w rd, rs2, (rs1)' },
  { mnemonic: 'amomin.w',     operands: '${1:rd}, ${2:rs2}, (${3:rs1})', description: 'A ext: amomin.w rd, rs2, (rs1)' },
  { mnemonic: 'amomax.w',     operands: '${1:rd}, ${2:rs2}, (${3:rs1})', description: 'A ext: amomax.w rd, rs2, (rs1)' },
  { mnemonic: 'amominu.w',    operands: '${1:rd}, ${2:rs2}, (${3:rs1})', description: 'A ext: amominu.w rd, rs2, (rs1)' },
  { mnemonic: 'amomaxu.w',    operands: '${1:rd}, ${2:rs2}, (${3:rs1})', description: 'A ext: amomaxu.w rd, rs2, (rs1)' },
  { mnemonic: 'lr.d',         operands: '${1:rd}, (${2:rs1})',       description: 'A ext RV64: lr.d rd, (rs1) — load reserved double' },
  { mnemonic: 'sc.d',         operands: '${1:rd}, ${2:rs2}, (${3:rs1})', description: 'A ext RV64: sc.d rd, rs2, (rs1) — store conditional double' },
  { mnemonic: 'amoswap.d',    operands: '${1:rd}, ${2:rs2}, (${3:rs1})', description: 'A ext RV64: amoswap.d rd, rs2, (rs1)' },
  { mnemonic: 'amoadd.d',     operands: '${1:rd}, ${2:rs2}, (${3:rs1})', description: 'A ext RV64: amoadd.d rd, rs2, (rs1)' },
  { mnemonic: 'amoxor.d',     operands: '${1:rd}, ${2:rs2}, (${3:rs1})', description: 'A ext RV64: amoxor.d rd, rs2, (rs1)' },
  { mnemonic: 'amoand.d',     operands: '${1:rd}, ${2:rs2}, (${3:rs1})', description: 'A ext RV64: amoand.d rd, rs2, (rs1)' },
  { mnemonic: 'amoor.d',      operands: '${1:rd}, ${2:rs2}, (${3:rs1})', description: 'A ext RV64: amoor.d rd, rs2, (rs1)' },
  { mnemonic: 'amomin.d',     operands: '${1:rd}, ${2:rs2}, (${3:rs1})', description: 'A ext RV64: amomin.d rd, rs2, (rs1)' },
  { mnemonic: 'amomax.d',     operands: '${1:rd}, ${2:rs2}, (${3:rs1})', description: 'A ext RV64: amomax.d rd, rs2, (rs1)' },
  { mnemonic: 'amominu.d',    operands: '${1:rd}, ${2:rs2}, (${3:rs1})', description: 'A ext RV64: amominu.d rd, rs2, (rs1)' },
  { mnemonic: 'amomaxu.d',    operands: '${1:rd}, ${2:rs2}, (${3:rs1})', description: 'A ext RV64: amomaxu.d rd, rs2, (rs1)' },
];

const ALL_INSTRUCTIONS: InstructionDef[] = [
  ...RV32I_R, ...RV32I_I, ...RV32I_SHIFT, ...RV32I_LOAD,
  ...RV32I_STORE, ...RV32I_BRANCH, ...RV32I_U, ...RV32I_J,
  ...RV32I_SYSTEM, ...RV64I, ...RV_M, ...PSEUDO, ...CSR, ...RV_A,
];

// ── 辅助：计算当前单词范围 ──────────────────────────────────────

function getCurrentWordRange(document: vscode.TextDocument, position: vscode.Position): vscode.Range | undefined {
  // 匹配标识符: 字母、数字、下划线、点号 (如 lr.w, amoswap.d)
  const wordPattern = /[a-zA-Z_][a-zA-Z0-9_.]*/;
  const line = document.lineAt(position.line);
  const lineText = line.text;
  const col = position.character;

  let start = col;
  while (start > 0 && wordPattern.test(lineText[start - 1])) {
    start--;
  }

  let end = col;
  while (end < lineText.length && wordPattern.test(lineText[end])) {
    end++;
  }

  if (start === end) {
    return undefined; // 光标不在单词上
  }

  return new vscode.Range(position.line, start, position.line, end);
}

// ── 创建指令 CompletionItem ─────────────────────────────────────

function createInstructionItem(inst: InstructionDef): vscode.CompletionItem {
  const label = inst.mnemonic;
  const insertText = inst.operands
    ? `${inst.mnemonic} ${inst.operands}`
    : inst.mnemonic;

  const item = new vscode.CompletionItem(label, vscode.CompletionItemKind.Snippet);
  item.detail = inst.description;
  item.insertText = new vscode.SnippetString(insertText);
  item.filterText = inst.mnemonic;
  item.sortText = '0' + inst.mnemonic;
  // 保留后续 Tab 切换占位符的能力
  return item;
}

function createMultiLineSnippetItem(name: string, snippet: SnippetDefinition): vscode.CompletionItem {
  // 多行片段的 body 可能不以 prefix 开头 (如 func → "${1:label}:" )
  // 因此用 prefix 替换光标处单词，然后展开
  const item = new vscode.CompletionItem(snippet.prefix, vscode.CompletionItemKind.Snippet);
  item.detail = name;
  item.documentation = snippet.description;
  item.insertText = new vscode.SnippetString(snippet.body.join('\n'));
  item.filterText = snippet.prefix;
  item.sortText = '1' + snippet.prefix; // 指令 (sortText '0*') 排在前，多行片段在后
  return item;
}

// ── 激活入口 ────────────────────────────────────────────────────

export function activate(context: vscode.ExtensionContext) {

  console.log('Assembly extension is activating...');

  const registerProvider = new RegisterProvider();

  const treeView = vscode.window.createTreeView('asmRegisterViewer', {
    treeDataProvider: registerProvider,
    showCollapseAll: true
  });
  context.subscriptions.push(treeView);

  // 注册所有命令
  const commands = [
    vscode.commands.registerCommand('asmRegisterViewer.showRegisters', () => {
      vscode.commands.executeCommand('asmRegisterViewer.focus');
      const editor = vscode.window.activeTextEditor;
      if (editor && isRiscVFile(editor.document)) {
        const line = editor.selection.active.line + 1;
        registerProvider.updateToLine(editor.document, line);
      } else {
        vscode.window.showInformationMessage('Please open a RISC-V assembly file first.');
      }
    }),

    vscode.commands.registerCommand('asmRegisterViewer.reset', () => {
      registerProvider.resetRegisters();
      vscode.window.showInformationMessage('All registers reset');
    }),

    vscode.commands.registerCommand('asmRegisterViewer.copyValue', (item: RegisterItem) => {
      if (item?.register) {
        vscode.env.clipboard.writeText(item.register.currentValue);
        vscode.window.showInformationMessage(`Copied ${item.register.name}: ${item.register.currentValue}`);
      }
    }),

    vscode.commands.registerCommand('riscv-register.toggleShowChanged', () => {
      registerProvider.toggleShowChangedOnly();
    }),

    vscode.commands.registerCommand('riscv-register.cycleDisplayBase', () => {
      registerProvider.cycleDisplayBase();
    })
  ];

  commands.forEach(cmd => context.subscriptions.push(cmd));

  // 监听文档编辑变化
  vscode.workspace.onDidChangeTextDocument(event => {
    if (isRiscVFile(event.document)) {
      const editor = vscode.window.activeTextEditor;
      if (editor && editor.document === event.document) {
        const line = editor.selection.active.line + 1;
        registerProvider.updateToLine(event.document, line);
      }
    }
  });

  // 监听文档保存
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

  // 监听活动编辑器变化
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

  // ── 代码片段 CompletionItemProvider ───────────────────────────
  const snippetProvider = vscode.languages.registerCompletionItemProvider(
    { language: 'riscv-assembly' },
    {
      provideCompletionItems(document, position) {
        const config = vscode.workspace.getConfiguration('asmRegisterViewer');
        const enableSnippets = config.get<boolean>('enableSnippets', true);
        if (!enableSnippets) {
          return undefined;
        }

        const wordRange = getCurrentWordRange(document, position);
        const items: vscode.CompletionItem[] = [];

        // 1. 指令级片段 — 始终提供
        for (const inst of ALL_INSTRUCTIONS) {
          const item = createInstructionItem(inst);
          if (wordRange) {
            item.range = wordRange;
          }
          items.push(item);
        }

        // 2. 多行结构性片段
        const multiSnippets = loadSnippets(context);
        if (multiSnippets) {
          for (const [name, snippet] of Object.entries(multiSnippets)) {
            const item = createMultiLineSnippetItem(name, snippet);
            if (wordRange) {
              item.range = wordRange;
            }
            items.push(item);
          }
        }

        return items;
      }
    }
  );
  context.subscriptions.push(snippetProvider);
}

// ── 辅助函数 ────────────────────────────────────────────────────

function isRiscVFile(document: vscode.TextDocument): boolean {
  return document.languageId === 'riscv-assembly' ||
         document.fileName.endsWith('.s') ||
         document.fileName.endsWith('.S');
}

function loadSnippets(context: vscode.ExtensionContext): Record<string, SnippetDefinition> | null {
  try {
    const snippetsPath = path.join(context.extensionPath, 'snippets', 'riscv-assembly.json');
    const raw = fs.readFileSync(snippetsPath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function deactivate() {}
