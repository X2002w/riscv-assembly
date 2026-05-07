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

  // 当前解析上下文中的 label 和 equ 定义
  private defineValue: Map<string, string> = new Map();
  private labelAddress: Map<string, string> = new Map();

  constructor() {
    this.initializeRegisters();
  }

  private initializeRegisters() {
    // 初始化33个寄存器
    const riscvRegister = [

      // 32个通用寄存器
      // 使用寄存器的别名，而不是x0 - x31
      { name: 'zero', bits: 64, type: 'special' as const, init: '0x0' },
      { name: 'ra', bits: 64, type: 'temp' as const, init: '0x0' },
      { name: 'sp', bits: 64, type: 'special' as const, init: '0x0' },
      { name: 'gp', bits: 64, type: 'special' as const, init: '0x0' },
      { name: 'tp', bits: 64, type: 'special' as const, init: '0x0' },
      { name: 't0', bits: 64, type: 'temp' as const, init: '0x0' },
      { name: 't1', bits: 64, type: 'temp' as const, init: '0x0' },
      { name: 't2', bits: 64, type: 'temp' as const, init: '0x0' },
      { name: 's0', bits: 64, type: 'save' as const, init: '0x0' },
      { name: 's1', bits: 64, type: 'save' as const, init: '0x0' },
      { name: 'a0', bits: 64, type: 'temp' as const, init: '0x0' },
      { name: 'a1', bits: 64, type: 'temp' as const, init: '0x0' },
      { name: 'a2', bits: 64, type: 'temp' as const, init: '0x0' },
      { name: 'a3', bits: 64, type: 'temp' as const, init: '0x0' },
      { name: 'a4', bits: 64, type: 'temp' as const, init: '0x0' },
      { name: 'a5', bits: 64, type: 'temp' as const, init: '0x0' },
      { name: 'a6', bits: 64, type: 'temp' as const, init: '0x0' },
      { name: 'a7', bits: 64, type: 'temp' as const, init: '0x0' },
      { name: 's2', bits: 64, type: 'save' as const, init: '0x0' },
      { name: 's3', bits: 64, type: 'save' as const, init: '0x0' },
      { name: 's4', bits: 64, type: 'save' as const, init: '0x0' },
      { name: 's5', bits: 64, type: 'save' as const, init: '0x0' },
      { name: 's6', bits: 64, type: 'save' as const, init: '0x0' },
      { name: 's7', bits: 64, type: 'save' as const, init: '0x0' },
      { name: 's8', bits: 64, type: 'save' as const, init: '0x0' },
      { name: 's9', bits: 64, type: 'save' as const, init: '0x0' },
      { name: 's10', bits: 64, type: 'save' as const, init: '0x0' },
      { name: 's11', bits: 64, type: 'save' as const, init: '0x0' },
      { name: 't3', bits: 64, type: 'temp' as const, init: '0x0' },
      { name: 't4', bits: 64, type: 'temp' as const, init: '0x0' },
      { name: 't5', bits: 64, type: 'temp' as const, init: '0x0' },
      { name: 't6', bits: 64, type: 'temp' as const, init: '0x0' },
      // program counter
      { name: 'pc', bits: 64, type: 'special' as const, init: '0x0' }
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

  }

  // 将寄存器值转换为 BigInt
  private regToBigInt(name: string): bigint {
    const reg = this.registers.get(name);
    if (!reg) return BigInt(0);
    try {
      return BigInt(reg.currentValue);
    } catch {
      return BigInt(0);
    }
  }

  // 更新寄存器值并记录历史
  private setRegister(name: string, value: string) {
    const reg = this.registers.get(name);
    if (reg) {
      reg.previousValues.push(reg.currentValue);
      reg.currentValue = value;
      reg.changed = true;
    }
  }

  // 解析内存操作数 offset(rs) -> { offset, rs }
  private parseMemOperand(op: string): { offset: string; rs: string } | null {
    const match = op.match(/^([^(]+)\(([^)]+)\)$/);
    if (match) {
      return { offset: match[1].trim(), rs: match[2].trim() };
    }
    return null;
  }

  // 安全地将字符串转换为 BigInt
  // 支持: 十进制/十六进制数字、.equ 常量、label 地址、寄存器名
  private safeBigInt(s: string): bigint {
    // 如果是纯数字 (十进制或0x十六进制)，直接转换
    if (/^-?[0-9]+$/.test(s) || /^-?0x[0-9a-fA-F]+$/.test(s)) {
      try {
        return BigInt(s);
      } catch {
        // fall through to symbol lookup
      }
    }
    // 检查 .equ 常量定义
    if (this.defineValue.has(s)) {
      return this.safeBigInt(this.defineValue.get(s)!);
    }
    // 检查 label 地址
    if (this.labelAddress.has(s)) {
      return this.safeBigInt(this.labelAddress.get(s)!);
    }
    // 检查是否是寄存器名（取其当前值）
    if (this.registers.has(s)) {
      return this.regToBigInt(s);
    }
    // 无法解析，返回 0
    return BigInt(0);
  }

  // 格式化为紧凑 hex 字符串 (负值以64位补码显示)
  private fmtHex(n: bigint): string {
    if (n < 0) {
      n = (BigInt(1) << BigInt(64)) + n;
    }
    return '0x' + n.toString(16);
  }

  // 只解析输入的一行汇编指令, 并更新涉及到的regs 历史状态
  private processLine(line: string, lineNumber: number) {

    // 移除空白字符(\n, \t, 空格)
    // 解析移除注释(# or // 后面的内容) -> 多行注释暂不处理
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//'))
      return;

    // 跳过标签行 (label:)
    if (/^[a-zA-Z_][a-zA-Z0-9_]*:/.test(trimmed))
      return;

    // 处理行内注释
    const code = trimmed.split('#')[0].split('//')[0].trim();
    if (!code)
      return;

    const parts = code.split(/\s+/);
    if (parts.length < 2)
      return;

    const instruction = parts[0].toUpperCase();
    const operands = parts.slice(1)
      .flatMap(p => p.split(','))
      .filter(s => s.length > 0)
      .map(s => s.trim());

    // 跳过伪指令 .section .global .space 等
    if (instruction.startsWith('.'))
      return;

    switch (instruction) {
      // === 伪指令 ===
      case 'LI': {
        // li rd, immediate -> addi rd, zero, imm
        if (operands.length !== 2) return;
        const rd = operands[0];
        this.setRegister(rd, this.fmtHex(this.safeBigInt(operands[1])));
        break;
      }
      case 'MV': {
        // mv rd, rs -> addi rd, rs, 0
        if (operands.length !== 2) return;
        const rd = operands[0], rs = operands[1];
        if (this.registers.has(rd) && this.registers.has(rs)) {
          this.setRegister(rd, this.registers.get(rs)!.currentValue);
        }
        break;
      }
      case 'RET': {
        // ret -> jalr zero, ra, 0
        if (this.registers.has('ra')) {
          this.setRegister('pc', this.registers.get('ra')!.currentValue);
        }
        break;
      }
      case 'CALL': {
        // call offset -> ra <- pc + 4, pc <- target
        if (operands.length !== 1) return;
        if (this.registers.has('ra') && this.registers.has('pc')) {
          const nextPc = this.regToBigInt('pc') + BigInt(4);
          this.setRegister('ra', this.fmtHex(nextPc));
          this.setRegister('pc', operands[0]);
        }
        break;
      }
      case 'LA':
      case 'LLA': {
        // la rd, symbol -> rd = address of symbol
        if (operands.length !== 2) return;
        this.setRegister(operands[0], operands[1]);
        break;
      }
      case 'NOP': {
        // nop -> addi zero, zero, 0 (does nothing)
        break;
      }

      // === 算术指令 (R-type: rd, rs1, rs2) ===
      case 'ADD':
      case 'ADDW': {
        if (operands.length !== 3) return;
        const [rd, rs1, rs2] = operands;
        if (this.registers.has(rd) && this.registers.has(rs1) && this.registers.has(rs2)) {
          const result = this.regToBigInt(rs1) + this.regToBigInt(rs2);
          this.setRegister(rd, this.fmtHex(result));
        }
        break;
      }
      case 'SUB':
      case 'SUBW': {
        if (operands.length !== 3) return;
        const [rd, rs1, rs2] = operands;
        if (this.registers.has(rd) && this.registers.has(rs1) && this.registers.has(rs2)) {
          const result = this.regToBigInt(rs1) - this.regToBigInt(rs2);
          this.setRegister(rd, this.fmtHex(result));
        }
        break;
      }

      // === 算术立即数 (I-type: rd, rs1, imm) ===
      case 'ADDI':
      case 'ADDIW': {
        if (operands.length !== 3) return;
        const [rd, rs1, imm] = operands;
        if (this.registers.has(rd) && this.registers.has(rs1)) {
          const result = this.regToBigInt(rs1) + this.safeBigInt(imm);
          this.setRegister(rd, this.fmtHex(result));
        }
        break;
      }

      // === 逻辑指令 ===
      case 'AND':
      case 'ANDI': {
        if (operands.length !== 3) return;
        const [rd, rs1, rs2] = operands;
        if (this.registers.has(rd) && this.registers.has(rs1)) {
          const val = this.regToBigInt(rs1) & this.regToBigInt(rs2);
          this.setRegister(rd, this.fmtHex(val));
        }
        break;
      }
      case 'OR':
      case 'ORI': {
        if (operands.length !== 3) return;
        const [rd, rs1, rs2] = operands;
        if (this.registers.has(rd) && this.registers.has(rs1)) {
          const val = this.regToBigInt(rs1) | this.regToBigInt(rs2);
          this.setRegister(rd, this.fmtHex(val));
        }
        break;
      }
      case 'XOR':
      case 'XORI': {
        if (operands.length !== 3) return;
        const [rd, rs1, rs2] = operands;
        if (this.registers.has(rd) && this.registers.has(rs1)) {
          const val = this.regToBigInt(rs1) ^ this.regToBigInt(rs2);
          this.setRegister(rd, this.fmtHex(val));
        }
        break;
      }
      case 'SLL':
      case 'SLLI': {
        if (operands.length !== 3) return;
        const [rd, rs1, rs2] = operands;
        if (this.registers.has(rd) && this.registers.has(rs1)) {
          const shift = Number(this.safeBigInt(rs2) & BigInt(0x3F));
          const val = this.regToBigInt(rs1) << BigInt(shift);
          this.setRegister(rd, this.fmtHex(val));
        }
        break;
      }
      case 'SRL':
      case 'SRLI': {
        if (operands.length !== 3) return;
        const [rd, rs1, rs2] = operands;
        if (this.registers.has(rd) && this.registers.has(rs1)) {
          const shift = Number(this.safeBigInt(rs2) & BigInt(0x3F));
          const val = this.regToBigInt(rs1) >> BigInt(shift);
          this.setRegister(rd, this.fmtHex(val));
        }
        break;
      }
      case 'SRA':
      case 'SRAI': {
        if (operands.length !== 3) return;
        const [rd, rs1, rs2] = operands;
        if (this.registers.has(rd) && this.registers.has(rs1)) {
          const shift = Number(this.safeBigInt(rs2) & BigInt(0x3F));
          const value = this.regToBigInt(rs1);
          const val = value >> BigInt(shift);
          this.setRegister(rd, this.fmtHex(val));
        }
        break;
      }

      // === 加载/存储 ===
      case 'LW':
      case 'LD':
      case 'LB':
      case 'LH':
      case 'LBU':
      case 'LHU':
      case 'LWU': {
        // lw rd, offset(rs1) -> rd changed (value from memory, mark as loaded)
        if (operands.length !== 2) return;
        const rd = operands[0];
        this.setRegister(rd, `mem[${operands[1]}]`);
        break;
      }
      case 'SW':
      case 'SD':
      case 'SB':
      case 'SH': {
        // sw rs2, offset(rs1) -> memory changed, registers unchanged
        break;
      }

      // === LUI / AUIPC ===
      case 'LUI': {
        // lui rd, imm -> rd = imm << 12
        if (operands.length !== 2) return;
        const rd = operands[0];
        const imm = this.safeBigInt(operands[1]) << BigInt(12);
        this.setRegister(rd, this.fmtHex(imm));
        break;
      }
      case 'AUIPC': {
        // auipc rd, imm -> rd = pc + (imm << 12)
        if (operands.length !== 2) return;
        const rd = operands[0];
        const imm = this.safeBigInt(operands[1]) << BigInt(12);
        const result = this.regToBigInt('pc') + imm;
        this.setRegister(rd, this.fmtHex(result));
        break;
      }

      // === 跳转指令 ===
      case 'JAL': {
        // jal rd, offset -> rd = pc + 4, pc += offset
        if (operands.length !== 2) return;
        const rd = operands[0], offset = operands[1];
        const nextPc = this.regToBigInt('pc') + BigInt(4);
        this.setRegister(rd, this.fmtHex(nextPc));
        this.setRegister('pc', offset);
        break;
      }
      case 'JALR': {
        // jalr rd, offset(rs1) -> rd = pc + 4, pc = rs1 + offset
        if (operands.length !== 2) return;
        const rd = operands[0];
        const memOp = this.parseMemOperand(operands[1]);
        const nextPc = this.regToBigInt('pc') + BigInt(4);
        this.setRegister(rd, this.fmtHex(nextPc));
        if (memOp && this.registers.has(memOp.rs)) {
          const target = this.regToBigInt(memOp.rs) + this.safeBigInt(memOp.offset);
          this.setRegister('pc', this.fmtHex(target));
        }
        break;
      }
      case 'J':
      case 'JR': {
        // j offset -> jal zero, offset; jr rs -> jalr zero, 0(rs)
        if (operands.length !== 1) return;
        this.setRegister('pc', operands[0]);
        break;
      }

      // === 分支指令 (可能改变 pc) ===
      case 'BEQ':
      case 'BNE':
      case 'BLT':
      case 'BGE':
      case 'BLTU':
      case 'BGEU': {
        // beq/bne/blt/bge rs1, rs2, offset -> if condition, pc += offset
        if (operands.length !== 3) return;
        const [rs1, rs2, offset] = operands;
        if (this.registers.has(rs1) && this.registers.has(rs2)) {
          const v1 = this.regToBigInt(rs1);
          const v2 = this.regToBigInt(rs2);
          let taken = false;
          switch (instruction) {
            case 'BEQ': taken = v1 === v2; break;
            case 'BNE': taken = v1 !== v2; break;
            case 'BLT': taken = v1 < v2; break;
            case 'BGE': taken = v1 >= v2; break;
            case 'BLTU': taken = v1 < v2; break;
            case 'BGEU': taken = v1 >= v2; break;
          }
          if (taken) {
            this.setRegister('pc', offset);
          }
        }
        break;
      }

      // === 伪指令扩展 ===
      case 'NEG':
      case 'NEGW': {
        // neg rd, rs -> sub rd, zero, rs
        if (operands.length !== 2) return;
        const [rd, rs] = operands;
        if (this.registers.has(rd) && this.registers.has(rs)) {
          const val = BigInt(0) - this.regToBigInt(rs);
          this.setRegister(rd, this.fmtHex(val));
        }
        break;
      }
      case 'NOT': {
        // not rd, rs -> xori rd, rs, -1
        if (operands.length !== 2) return;
        const [rd, rs] = operands;
        if (this.registers.has(rd) && this.registers.has(rs)) {
          const val = this.regToBigInt(rs) ^ BigInt(-1);
          this.setRegister(rd, this.fmtHex(val));
        }
        break;
      }
      case 'SEQZ': {
        // seqz rd, rs -> rd = (rs == 0) ? 1 : 0
        if (operands.length !== 2) return;
        const [rd, rs] = operands;
        if (this.registers.has(rd) && this.registers.has(rs)) {
          const val = this.regToBigInt(rs) === BigInt(0) ? BigInt(1) : BigInt(0);
          this.setRegister(rd, this.fmtHex(val));
        }
        break;
      }
      case 'SNEZ': {
        // snez rd, rs -> rd = (rs != 0) ? 1 : 0
        if (operands.length !== 2) return;
        const [rd, rs] = operands;
        if (this.registers.has(rd) && this.registers.has(rs)) {
          const val = this.regToBigInt(rs) !== BigInt(0) ? BigInt(1) : BigInt(0);
          this.setRegister(rd, this.fmtHex(val));
        }
        break;
      }
      case 'SLTZ': {
        // sltz rd, rs -> rd = (rs < 0) ? 1 : 0
        if (operands.length !== 2) return;
        const [rd, rs] = operands;
        if (this.registers.has(rd) && this.registers.has(rs)) {
          const val = this.regToBigInt(rs) < BigInt(0) ? BigInt(1) : BigInt(0);
          this.setRegister(rd, this.fmtHex(val));
        }
        break;
      }
      case 'SGTZ': {
        // sgtz rd, rs -> rd = (rs > 0) ? 1 : 0
        if (operands.length !== 2) return;
        const [rd, rs] = operands;
        if (this.registers.has(rd) && this.registers.has(rs)) {
          const val = this.regToBigInt(rs) > BigInt(0) ? BigInt(1) : BigInt(0);
          this.setRegister(rd, this.fmtHex(val));
        }
        break;
      }
      case 'SEXT.W': {
        // sext.w rd, rs -> sign-extend 32-bit value
        if (operands.length !== 2) return;
        const [rd, rs] = operands;
        if (this.registers.has(rd) && this.registers.has(rs)) {
          const val32 = BigInt.asIntN(32, this.regToBigInt(rs));
          this.setRegister(rd, this.fmtHex(val32));
        }
        break;
      }

      default:
        break;
    }

  }

  // 解析汇编代码到指定行
  // 每当更改文件之后，重新解析到当前行
  parseToLine(asmCode: string, targetLine: number): Map<string, RegisterState> {
    // 每次重新解析前先重置所有寄存器
    this.initializeRegisters();

    const lines: Array<string> = asmCode.split('\n');

    // 第一遍：收集光标之前所有行的 label 地址和 equ 定义
    this.defineValue.clear();
    this.labelAddress.clear();

    for (let i = 0; i < Math.min(targetLine, lines.length); i++) {
      const trimmed = lines[i].trim();
      if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//'))
        continue;
      // 处理行内注释
      const code = trimmed.split('#')[0].split('//')[0].trim();
      if (!code)
        continue;
      const parts = code.split(/\s+/);
      const firstToken = parts[0].toUpperCase();

      // 标签: label: (可能单独成行)
      if (firstToken.endsWith(':')) {
        const label = firstToken.slice(0, -1);
        this.labelAddress.set(label, this.fmtHex(BigInt(i * 4)));
        continue;
      }
      // 需要至少2个token才是指令行
      if (parts.length < 2)
        continue;
      const operands = parts.slice(1)
        .flatMap((p: string) => p.split(','))
        .filter((s: string) => s.length > 0);

      // .equ <name>, <value>
      if (firstToken === '.EQU' && parts.length >= 3) {
        const name = parts[1].replace(/,/g, '').trim();
        const value = parts.slice(2).join('').replace(/,/g, '').trim();
        this.defineValue.set(name, value);
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