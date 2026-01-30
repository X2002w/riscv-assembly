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

export class asmParser {

  // 每个寄存器的当前状态
  private registers: Map<string, RegisterState> = new Map();
  private history = {
    // 按寄存器名存储的历史值（每行的值）
    registerChanges: new Map<string, Array<{
        line: number;      // 发生变化的行号
        value: string;     // 该行执行后的值
        previous: string;  // 变化前的值
    }>>(),
  };

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

    this.history.registerChanges.clear();
    riscvRegister.forEach(reg => {
      this.history.registerChanges.set(reg.name, []);
    });

  }

  // 只解析输入的一行汇编指令, 并更新涉及到的regs 历史状态
  private processLine(line: string, lineNumber: number) {

    // 移除空白字符(\n, \t, 空格)
    // 解析移除注释(# or // 后面的内容) -> 多行注释暂不处理
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
      case 'RET': {
        // ret -> jalr zero, ra, 0
        // jalr x0, 0(x1) -> pc <- ra + 0, x0 === zero 
        if (this.registers.has('zero') && this.registers.has('ra')) {
          const regSrc = this.registers.get('ra')!;
          const regPc = this.registers.get('pc')!;
          regPc.previousValues.push(regPc.currentValue);
          regPc.currentValue = regSrc.currentValue;
          regPc.changed = true;
        }
        break;
      }
      case 'CALL': {
        // call table -> ra <- pc + 4, pc <- table_address
        if (operands.length !== 1)
          return;
        const tableAdderss = operands[0];
        if (this.registers.has('ra') && this.registers.has('pc')) {
          const regRa = this.registers.get('ra')!;
          const regPc = this.registers.get('pc')!;
          regRa.previousValues.push(regRa.currentValue);
          regPc.previousValues.push(regPc.currentValue);
          regRa.currentValue = (BigInt(regPc.currentValue) + BigInt(4)).toString();
          regPc.currentValue = tableAdderss;
          regRa.changed = true;
          regPc.changed = true;
        }

        break;
      }


      default:
        // 其他指令暂不处理
        break;
      
      // 二次解析宏

    }

  }
  // rd, rs1, rs2, imm
  // rd, zaero,
  private saveLineSnapshot(lineNumber: number) {
    const snapshot: Record<string, string> = {};
    for (const [name, reg] of this.registers) {
      snapshot[name] = reg.currentValue;
    }

  }
  

  // 解析汇编代码到指定行
  // 每当更改文件之后，重新解析到当前行
  parseToLine(asmCode: string, targetLine: number): Map<string, RegisterState> {
    const lines: Array<string> = asmCode.split('\n');

    // 记录lable地址, define value
    const defineValue: Map<string, string> = new Map();
    const labelAddress: Map<string, string> = new Map();
    defineValue.clear();
    labelAddress.clear();

    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//'))
        continue;
      // 处理行内注释
      const code = trimmed.split('#')[0].split('//')[0].trim();
      const parts = code.split(/\s+/);
      if (parts.length < 2)
        continue;
      const instruction = parts[0].toUpperCase();
      const operands = parts.slice(1).join('').split(',');
      
      // 单独提取标签: <label:>
      if (!instruction.endsWith(':')) {
        const label = instruction.slice(0, -1);
        labelAddress.set(label, `0x${(i * 4).toString(16).padStart(8, '0')}`);
        continue;
      }
      // .equ <name>, <value>
      if (instruction === '.EQU' && operands.length === 2) {
        const name = operands[0].trim();
        const value = operands[1].trim();
        defineValue.set(name, value);
        continue;
      }

    }
   



    // 重新解析到目标行
    for (let i = 0; i < Math.min(targetLine, lines.length); i++) {
      this.processLine(lines[i], i + 1);
    }

    return this.registers;
  }

  // 获取寄存器的当前状态
  getRegisterStates(): Map<string, RegisterState> {
    return this.registers;
  }

  reset(): void {
    this.initializeRegisters();
  }
 
}