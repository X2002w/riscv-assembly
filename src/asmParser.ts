export interface RegisterState {
  name: string;
  currentValue: string;
  previousValues: Array<string>;
  bits: number;

  // x0 - zero register, always 0
  // 目前只解析32个通用寄存器 + pc
  type: 'save' | 'temp' | 'special' | 'pc';
  changed: boolean;
}

class asmParser {

  private registers: Map<string, RegisterState> = new Map();
  private history = {
    // 按寄存器名存储的历史值（每行的值）
    registerChanges: new Map<string, Array<{
        line: number;      // 发生变化的行号
        value: string;     // 该行执行后的值
        previous: string;  // 变化前的值
    }>>(),
      
    // 按行号存储的快照（每行所有寄存器的完整状态）
    lineSnapshots: new Map<number, Map<string, string>>(),
  };

  private registerHistory: Map<string, any[]> = new Map();

  constructor() {
    this.initializeRegisters();
  }

  private initializeRegisters() {
    // 初始化33个寄存器
    const riscvRegister = [

      // 32个通用寄存器
      // 使用寄存器的别名，而不是x0 - x31
      { name: 'zero', bits: 64, type: 'special' as const, init: '0x0000000000000000' },
      { name: 'ra', bits: 64, type: 'temp' as const, init: '0x0000000000000000' },
      { name: 'sp', bits: 64, type: 'special' as const, init: '0x0000000000000000' },
      { name: 'gp', bits: 64, type: 'special' as const, init: '0x0000000000000000' },
      { name: 'tp', bits: 64, type: 'special' as const, init: '0x0000000000000000' },
      { name: 't0', bits: 64, type: 'temp' as const, init: '0x0000000000000000' },
      { name: 't1', bits: 64, type: 'temp' as const, init: '0x0000000000000000' },
      { name: 't2', bits: 64, type: 'temp' as const, init: '0x0000000000000000' },
      { name: 's0', bits: 64, type: 'save' as const, init: '0x0000000000000000' },
      { name: 's1', bits: 64, type: 'save' as const, init: '0x0000000000000000' },
      { name: 'a0', bits: 64, type: 'temp' as const, init: '0x0000000000000000' },
      { name: 'a1', bits: 64, type: 'temp' as const, init: '0x0000000000000000' },
      { name: 'a2', bits: 64, type: 'temp' as const, init: '0x0000000000000000' },
      { name: 'a3', bits: 64, type: 'temp' as const, init: '0x0000000000000000' },
      { name: 'a4', bits: 64, type: 'temp' as const, init: '0x0000000000000000' },
      { name: 'a5', bits: 64, type: 'temp' as const, init: '0x0000000000000000' },
      { name: 'a6', bits: 64, type: 'temp' as const, init: '0x0000000000000000' },
      { name: 'a7', bits: 64, type: 'temp' as const, init: '0x0000000000000000' },
      { name: 's2', bits: 64, type: 'save' as const, init: '0x0000000000000000' },
      { name: 's3', bits: 64, type: 'save' as const, init: '0x0000000000000000' },
      { name: 's4', bits: 64, type: 'save' as const, init: '0x0000000000000000' },
      { name: 's5', bits: 64, type: 'save' as const, init: '0x0000000000000000' },
      { name: 's6', bits: 64, type: 'save' as const, init: '0x0000000000000000' },
      { name: 's7', bits: 64, type: 'save' as const, init: '0x0000000000000000' },
      { name: 's8', bits: 64, type: 'save' as const, init: '0x0000000000000000' },
      { name: 's9', bits: 64, type: 'save' as const, init: '0x0000000000000000' },
      { name: 's10', bits: 64, type: 'save' as const, init: '0x0000000000000000' },
      { name: 's11', bits: 64, type: 'save' as const, init: '0x0000000000000000' },
      { name: 't3', bits: 64, type: 'temp' as const, init: '0x0000000000000000' },
      { name: 't4', bits: 64, type: 'temp' as const, init: '0x0000000000000000' },
      { name: 't5', bits: 64, type: 'temp' as const, init: '0x0000000000000000' },
      { name: 't6', bits: 64, type: 'temp' as const, init: '0x0000000000000000' },
      // program counter
      { name: 'pc', bits: 64, type: 'special' as const, init: '0x0000000000000000' }
    ];

    this.registers.clear();
    riscvRegister.forEach(reg => {
      this.registers.set(reg.name, {
        name: reg.name,
        currentValue: reg.init,
        previousValues: [],
        bits: reg.bits,
        type: reg.type,
        changed: false
      });
    });

    this.registerHistory.clear();
    this.history.registerChanges.clear();
    this.history.lineSnapshots.clear();

  }

  private processLine(line: string, lineNumber: number) {
    // 解析汇编指令

    // 移除空白字符(\n, \t, 空格)
    // 解析移除注释(# or // 后面的内容) -> 暂时不处理多行注释
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//'))
      return;
    
    // 处理行内注释
    const code = trimmed.split('#')[0].split('//')[0].trim();

    const parts = code.split(/\s+/);
    if (parts.length < 2)
      return;

    const instruction = parts[0].toUpperCase();
    const operands = parts.slice(1).join('').split(',');

    // 先解析伪指令
    switch (instruction) {
      case 'LI': {
        // li rd, immediate
        // 小于12bits的立即数 拓展为 addi rd, zero, imm
        if (operands.length !== 2)
          return;
        const rd = operands[0];
        const immediate = operands[1];
        if (this.registers.has(rd)) {
          const reg = this.registers.get(rd)!;
          reg.previousValues.push(reg.currentValue);
          reg.currentValue = immediate;
          reg.changed = true;
        }
        break;
      }
      case 'MV': {
        // mv rd, rs
        if (operands.length !== 2)
          return;
        const rd = operands[0];
        const rs = operands[1];
        if (this.registers.has(rd) && this.registers.has(rs)) {
          const regDest = this.registers.get(rd)!;
          const regSrc = this.registers.get(rs)!;
          regDest.previousValues.push(regDest.currentValue);
          regDest.currentValue = regSrc.currentValue;
          regDest.changed = true;
        }
        break;
      }

      default:
        // 其他指令暂不处理
        break;
    }

  }

  private saveLineSnapshot(lineNumber: number) {
    const snapshot: Record<string, string> = {};
    for (const [name, reg] of this.registers) {
      snapshot[name] = reg.currentValue;
    }

    if (!this.registerHistory.has('lineSnapshots')) {
      this.registerHistory.set('lineSnapshots', []);
    }
    const lineSnapshots = this.registerHistory.get('lineSnapshots')!;
    lineSnapshots[lineNumber] = snapshot;
  }
  

  // 解析汇编代码到指定行
  // 每当更改文件之后，重新解析到当前行
  parseToLine(refursh: boolean,asmCode: string, targetLine: number): Map<string, RegisterState> {
    const lines: Array<string> = asmCode.split('\n');
    const processedLines: Array<string> = [];

    
    if(this.history.lineSnapshots.has(targetLine) && !refursh) {
      // 已有快照，且不强制刷新 直接恢复寄存器状态
      const snapshot = this.history.lineSnapshots.get(targetLine)!;

      for (const [name, value] of snapshot) {
        if (this.registers.has(name)) {
          const reg = this.registers.get(name)!;
          reg.previousValues.push(reg.currentValue);
          reg.currentValue = value;
          reg.changed = false;
        }
      }
      return this.registers;

    }

    // 目标行小于当前行，重置寄存器状态
   
    // 更新历史记录
    this.registerHistory.set('processedLines', processedLines);

    this.saveLineSnapshot(targetLine);

    return this.registers;
  }



}