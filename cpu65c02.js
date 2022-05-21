/* 65C02 JS emulator
(C)2013,2014 Gabor Lenart LGB */

"use strict";

function CPU65C02 (read, write) {
	var cycles, op;
	cpu = {};
	function readWord(addr) {
		return read(addr) | (read(addr + 1) << 8);
	}
	function push(data) { /* begin ins block: PUSH for 65C02 */ write(cpu.sp | 0x100, data); cpu.sp = (cpu.sp - 1) & 0xFF /* end ins block */ }
	function pop() { /* begin ins block: POP for 65C02 */ cpu.sp = (cpu.sp + 1) & 0xFF; return read(cpu.sp | 0x100) /* end ins block */ }
	function pushWord(data) { push(data >> 8) ; push(data & 0xFF) }
	function popWord() { var temp = pop() ; return temp | (pop() << 8) }
	function setP(st) {
		cpu.pfn = st & 128;
		cpu.pfv = st &  64;
		cpu.pfb = st &  16;
		cpu.pfd = st &   8;
		cpu.pfi = st &   4;
		cpu.pfz = st &   2;
		cpu.pfc = st &   1;
	}
	function getP() {
		return  (cpu.pfn ? 128 : 0) |
			(cpu.pfv ?  64 : 0) |
			/* begin ins block: GETPU for 65C02 */ 32 /* end ins block */ |
			(cpu.pfb ?  16 : 0) |
			(cpu.pfd ?   8 : 0) |
			(cpu.pfi ?   4 : 0) |
			(cpu.pfz ?   2 : 0) |
			(cpu.pfc ?   1 : 0);
	}
	cpu.map = function() {};
	cpu.reset = function() {
		cpu.pc = readWord(0xFFFC);
		setP(20);
		cpu.a = cpu.x = cpu.y = 0;
		cpu.sp = 0xFF;
		cycles = 0;
		cpu.irqLevel = cpu.nmiEdge = 0;
		cpu.fatal = false;
		console.log("CPU[65C02]: RESET, PC=$" + cpu.pc.toString(16));
	};
	function incPC(n) {
		cpu.pc = (cpu.pc + n) & 0xFFFF;
	}
	function setNZ(st) {
		cpu.pfn = st & 128;
		cpu.pfz = !st;
	}
	function $imm() {
		var o = cpu.pc;
		incPC(1);
		return o;
	}
	function $abs() {
		var o = read(cpu.pc);
		incPC(1);
		o |= read(cpu.pc) << 8;
		incPC(1);
		return o;
	}
	function $absx() {
		return ($abs() + cpu.x) & 0xFFFF;
	}
	function $absy() {
		return ($abs() + cpu.y) & 0xFFFF;
	}
	function $absi() {
		return readWord($abs());
	}
	function $absxi() {
		return readWord($absx());
	}
	function $zp() {
		var a = read(cpu.pc);
		incPC(1);
		return a;
	}
	function $zpi() {
		var a = read(cpu.pc);
		incPC(1);
		return read(a) | (read((a + 1) & 0xFF) << 8);
	}
	function $zpx() {
		var a = (read(cpu.pc) + cpu.x) & 0xFF;
		incPC(1);
		return a;
	}
	function $zpy() {
		var a = (read(cpu.pc) + cpu.y) & 0xFF;
		incPC(1);
		return a;
	}
	function $zpiy() {
		return ($zpi() + cpu.y) & 0xFFFF;
	}
	function $zpxi() {
		var a = read(cpu.pc) + cpu.x;
		incPC(1);
		return read(a & 0xFF) | (read((a + 1) & 0xFF) << 8);
	}
	function $BRA(cond) {
		 if (cond) {
                        var temp = read(cpu.pc);
                        if (temp & 128) temp = cpu.pc - (temp ^ 0xFF);
                        else temp = cpu.pc + temp + 1;
                        if (temp & 0xFF00 != cpu.pc & 0xFF00) cycles++;
                        cpu.pc = temp & 0xFFFF;
                        cycles++;
                } else
                        incPC(1);
	}
	function $CMP(reg, data) {
		var temp = (reg - data) & 0xFFFF;
		cpu.pfc = temp < 0x100;
		setNZ(temp & 0xFF);
	}
	function $TSB(addr) {
		var m = read(addr);
		cpu.pfz = (!(m & cpu.a));
		write(addr, m | cpu.a);
	}
	function $TRB(addr) {
		var m = read(addr);
		cpu.pfz = (!(m & cpu.a));
		write(addr, m & (255 - cpu.a));
	}
	function $ASL(addr) {
		var t = (addr == -1 ? cpu.a : read(addr));
		cpu.pfc = t & 128;
		t = (t << 1) & 0xFF;
		setNZ(t);
		if (addr == -1) cpu.a = t; else write(addr, t);
	}
	function $LSR(addr) {
		var t = addr == -1 ? cpu.a : read(addr);
		cpu.pfc = t & 1;
		t = (t >> 1) & 0xFF;
		setNZ(t);
		if (addr == -1) cpu.a = t; else write(addr, t);
	}
	function $BIT(data) {
		cpu.pfn = data & 128;
		cpu.pfv = data & 64;
		cpu.pfz = (!(cpu.a & data));
	}
	function $ADC(data) {
		if (cpu.pfd) {
			var temp  = (cpu.a & 0x0F) + (data & 0x0F) + (cpu.pfc ? 1 : 0);
			var temp2 = (cpu.a & 0xF0) + (data & 0xF0);
			if (temp > 9) { temp2 += 0x10; temp += 6 }
			cpu.pfv = (~(cpu.a ^ data) & (cpu.a ^ temp) & 0x80);
			if (temp2 > 0x90) temp2 += 0x60;
			cpu.pfc = (temp2 & 0xFF00);
			cpu.a = (temp & 0x0F) + (temp2 & 0xF0);
			setNZ(cpu.a);
		} else {
			var temp = data + cpu.a + (cpu.pfc ? 1 : 0);
			cpu.pfc = temp > 0xFF;
			cpu.pfv = (!((cpu.a ^ data) & 0x80) && ((cpu.a ^ temp) & 0x80));
			cpu.a = temp & 0xFF;
			setNZ(cpu.a);
		}
	}
	function $SBC(data) {
		if (cpu.pfd) {
			var temp = (cpu.a - (data & 0x0F) - (cpu.pfc ? 0 : 1)) & 0xFFFF;
			if ((temp & 0x0F) > (cpu.a & 0x0F)) temp -= 6;
			temp -= (data & 0xF0);
			if ((temp & 0xF0) > (cpu.a & 0xF0)) temp -= 0x60;
			cpu.pfv = (!(temp > cpu.a));
			cpu.pfc = (!(temp > cpu.a));
			cpu.a = temp & 0xFF;
			setNZ(cpu.a);
		} else {
			var temp = (cpu.a - data - (cpu.pfc ? 0 : 1)) & 0xFFFF;
			cpu.pfc = temp < 0x100;
			cpu.pfv = ((cpu.a ^ temp) & 0x80) && ((cpu.a ^ data) & 0x80);
			cpu.a = temp & 0xFF;
			setNZ(cpu.a);
		}
	}
	function $ROR(addr) {
		var t = addr == -1 ? cpu.a : read(addr);
		if (cpu.pfc) t |= 0x100;
		cpu.pfc = t & 1;
		t >>= 1;
		setNZ(t);
		if (addr == -1) cpu.a = t; else write(addr, t);
	}
	function $ROL(addr) {
		var t = addr == -1 ? cpu.a : read(addr);
		t = (t << 1) | (cpu.pfc ? 1 : 0);
		cpu.pfc = t & 0x100;
		t &= 0xFF;
		setNZ(t);
		if (addr == -1) cpu.a = t; else write(addr, t);
	}
	function unknownOpCode() {
		cpu.fatal = true;
		alert("Unknown opcode $" + cpu.op.toString(16) + " at " + cpu.old_pc.toString(16));
	}
	var opcodes = [
		function() { pushWord(cpu.pc + 1); cpu.pfb = 1 ; push(getP()) ; cpu.pfd = 0 ; cpu.pfi = 1 ; cpu.pc = readWord(0xFFFE) }, /* 0x0 BRK Implied */
		function() { setNZ(cpu.a |= read($zpxi())) }, /* 0x1 ORA (Zero_Page,X) */
		function() { incPC(1) }, /* 0x2 NOP imm (non-std NOP with addr mode) */
		function() {  }, /* 0x3 NOP (nonstd loc, implied) */
		function() { $TSB($zp()) }, /* 0x4 TSB Zero_Page */
		function() { setNZ(cpu.a |= read($zp())) }, /* 0x5 ORA Zero_Page */
		function() { $ASL($zp()) }, /* 0x6 ASL Zero_Page */
		function() { var a = $zp() ; write(a, read(a) & 254) }, /* 0x7 RMB Zero_Page */
		function() { push(getP() | 0x10) }, /* 0x8 PHP Implied */
		function() { setNZ(cpu.a |= read($imm())) }, /* 0x9 ORA Immediate */
		function() { $ASL(-1) }, /* 0xa ASL Accumulator */
		function() {  }, /* 0xb NOP (nonstd loc, implied) */
		function() { $TSB($abs()) }, /* 0xc TSB Absolute */
		function() { setNZ(cpu.a |= read($abs())) }, /* 0xd ORA Absolute */
		function() { $ASL($abs()) }, /* 0xe ASL Absolute */
		function() { $BRA(!(read($zp()) & 1)) }, /* 0xf BBR Relative */
		function() { $BRA(!cpu.pfn) }, /* 0x10 BPL Relative */
		function() { setNZ(cpu.a |= read($zpiy())) }, /* 0x11 ORA (Zero_Page),Y */
		function() { setNZ(cpu.a |= read($zpi())) }, /* 0x12 ORA (Zero_Page) */
		function() {  }, /* 0x13 NOP (nonstd loc, implied) */
		function() { $TRB($zp()) }, /* 0x14 TRB Zero_Page */
		function() { setNZ(cpu.a |= read($zpx())) }, /* 0x15 ORA Zero_Page,X */
		function() { $ASL($zpx()) }, /* 0x16 ASL Zero_Page,X */
		function() { var a = $zp() ; write(a, read(a) & 253) }, /* 0x17 RMB Zero_Page */
		function() { cpu.pfc = 0 }, /* 0x18 CLC Implied */
		function() { setNZ(cpu.a |= read($absy())) }, /* 0x19 ORA Absolute,Y */
		function() { setNZ(cpu.a = (cpu.a + 1) & 0xFF) }, /* 0x1a INA Accumulator */
		function() {  }, /* 0x1b NOP (nonstd loc, implied) */
		function() { $TRB($abs()) }, /* 0x1c TRB Absolute */
		function() { setNZ(cpu.a |= read($absx())) }, /* 0x1d ORA Absolute,X */
		function() { $ASL($absx()) }, /* 0x1e ASL Absolute,X */
		function() { $BRA(!(read($zp()) & 2)) }, /* 0x1f BBR Relative */
		function() { pushWord(cpu.pc + 1) ; cpu.pc = $abs() }, /* 0x20 JSR Absolute */
		function() { setNZ(cpu.a &= read($zpxi())) }, /* 0x21 AND (Zero_Page,X) */
		function() { incPC(1) }, /* 0x22 NOP imm (non-std NOP with addr mode) */
		function() {  }, /* 0x23 NOP (nonstd loc, implied) */
		function() { $BIT(read($zp())) }, /* 0x24 BIT Zero_Page */
		function() { setNZ(cpu.a &= read($zp())) }, /* 0x25 AND Zero_Page */
		function() { $ROL($zp()) }, /* 0x26 ROL Zero_Page */
		function() { var a = $zp() ; write(a, read(a) & 251) }, /* 0x27 RMB Zero_Page */
		function() { setP(pop() | 0x10) }, /* 0x28 PLP Implied */
		function() { setNZ(cpu.a &= read($imm())) }, /* 0x29 AND Immediate */
		function() { $ROL(-1) }, /* 0x2a ROL Accumulator */
		function() {  }, /* 0x2b NOP (nonstd loc, implied) */
		function() { $BIT(read($abs())) }, /* 0x2c BIT Absolute */
		function() { setNZ(cpu.a &= read($abs())) }, /* 0x2d AND Absolute */
		function() { $ROL($abs()) }, /* 0x2e ROL Absolute */
		function() { $BRA(!(read($zp()) & 4)) }, /* 0x2f BBR Relative */
		function() { $BRA(cpu.pfn) }, /* 0x30 BMI Relative */
		function() { setNZ(cpu.a &= read($zpiy())) }, /* 0x31 AND (Zero_Page),Y */
		function() { setNZ(cpu.a &= read($zpi())) }, /* 0x32 AND (Zero_Page) */
		function() {  }, /* 0x33 NOP (nonstd loc, implied) */
		function() { $BIT(read($zpx())) }, /* 0x34 BIT Zero_Page,X */
		function() { setNZ(cpu.a &= read($zpx())) }, /* 0x35 AND Zero_Page,X */
		function() { $ROL($zpx()) }, /* 0x36 ROL Zero_Page,X */
		function() { var a = $zp() ; write(a, read(a) & 247) }, /* 0x37 RMB Zero_Page */
		function() { cpu.pfc = 1 }, /* 0x38 SEC Implied */
		function() { setNZ(cpu.a &= read($absy())) }, /* 0x39 AND Absolute,Y */
		function() { setNZ(cpu.a = (cpu.a - 1) & 0xFF) }, /* 0x3a DEA Accumulator */
		function() {  }, /* 0x3b NOP (nonstd loc, implied) */
		function() { $BIT(read($absx())) }, /* 0x3c BIT Absolute,X */
		function() { setNZ(cpu.a &= read($absx())) }, /* 0x3d AND Absolute,X */
		function() { $ROL($absx()) }, /* 0x3e ROL Absolute,X */
		function() { $BRA(!(read($zp()) & 8)) }, /* 0x3f BBR Relative */
		function() { setP(pop() | 0x10) ; cpu.pc = popWord() }, /* 0x40 RTI Implied */
		function() { setNZ(cpu.a ^= read($zpxi())) }, /* 0x41 EOR (Zero_Page,X) */
		function() { incPC(1) }, /* 0x42 NOP imm (non-std NOP with addr mode) */
		function() {  }, /* 0x43 NOP (nonstd loc, implied) */
		function() { incPC(1) }, /* 0x44 NOP zp (non-std NOP with addr mode) */
		function() { setNZ(cpu.a ^= read($zp())) }, /* 0x45 EOR Zero_Page */
		function() { $LSR($zp()) }, /* 0x46 LSR Zero_Page */
		function() { var a = $zp() ; write(a, read(a) & 239) }, /* 0x47 RMB Zero_Page */
		function() { push(cpu.a) }, /* 0x48 PHA Implied */
		function() { setNZ(cpu.a ^= read($imm())) }, /* 0x49 EOR Immediate */
		function() { $LSR(-1) }, /* 0x4a LSR Accumulator */
		function() {  }, /* 0x4b NOP (nonstd loc, implied) */
		function() { cpu.pc = $abs() }, /* 0x4c JMP Absolute */
		function() { setNZ(cpu.a ^= read($abs())) }, /* 0x4d EOR Absolute */
		function() { $LSR($abs()) }, /* 0x4e LSR Absolute */
		function() { $BRA(!(read($zp()) & 16)) }, /* 0x4f BBR Relative */
		function() { $BRA(!cpu.pfv) }, /* 0x50 BVC Relative */
		function() { setNZ(cpu.a ^= read($zpiy())) }, /* 0x51 EOR (Zero_Page),Y */
		function() { setNZ(cpu.a ^= read($zpi())) }, /* 0x52 EOR (Zero_Page) */
		function() {  }, /* 0x53 NOP (nonstd loc, implied) */
		function() { incPC(1) }, /* 0x54 NOP zpx (non-std NOP with addr mode) */
		function() { setNZ(cpu.a ^= read($zpx())) }, /* 0x55 EOR Zero_Page,X */
		function() { $LSR($zpx()) }, /* 0x56 LSR Zero_Page,X */
		function() { var a = $zp() ; write(a, read(a) & 223) }, /* 0x57 RMB Zero_Page */
		function() { cpu.pfi = 0 }, /* 0x58 CLI Implied */
		function() { setNZ(cpu.a ^= read($absy())) }, /* 0x59 EOR Absolute,Y */
		function() { push(cpu.y) }, /* 0x5a PHY Implied */
		function() {  }, /* 0x5b NOP (nonstd loc, implied) */
		function() {  }, /* 0x5c NOP (nonstd loc, implied) */
		function() { setNZ(cpu.a ^= read($absx())) }, /* 0x5d EOR Absolute,X */
		function() { $LSR($absx()) }, /* 0x5e LSR Absolute,X */
		function() { $BRA(!(read($zp()) & 32)) }, /* 0x5f BBR Relative */
		function() { cpu.pc = (popWord() + 1) & 0xFFFF }, /* 0x60 RTS Implied */
		function() { $ADC(read($zpxi())) }, /* 0x61 ADC (Zero_Page,X) */
		function() { incPC(1) }, /* 0x62 NOP imm (non-std NOP with addr mode) */
		function() {  }, /* 0x63 NOP (nonstd loc, implied) */
		function() { write($zp(), 0) }, /* 0x64 STZ Zero_Page */
		function() { $ADC(read($zp())) }, /* 0x65 ADC Zero_Page */
		function() { $ROR($zp()) }, /* 0x66 ROR Zero_Page */
		function() { var a = $zp() ; write(a, read(a) & 191) }, /* 0x67 RMB Zero_Page */
		function() { setNZ(cpu.a = pop()) }, /* 0x68 PLA Implied */
		function() { $ADC(read($imm())) }, /* 0x69 ADC Immediate */
		function() { $ROR(-1) }, /* 0x6a ROR Accumulator */
		function() {  }, /* 0x6b NOP (nonstd loc, implied) */
		function() { cpu.pc = $absi() }, /* 0x6c JMP (Absolute) */
		function() { $ADC(read($abs())) }, /* 0x6d ADC Absolute */
		function() { $ROR($abs()) }, /* 0x6e ROR Absolute */
		function() { $BRA(!(read($zp()) & 64)) }, /* 0x6f BBR Relative */
		function() { $BRA(cpu.pfv) }, /* 0x70 BVS Relative */
		function() { $ADC(read($zpiy())) }, /* 0x71 ADC (Zero_Page),Y */
		function() { $ADC(read($zpi())) }, /* 0x72 ADC (Zero_Page) */
		function() {  }, /* 0x73 NOP (nonstd loc, implied) */
		function() { write($zpx(), 0) }, /* 0x74 STZ Zero_Page,X */
		function() { $ADC(read($zpx())) }, /* 0x75 ADC Zero_Page,X */
		function() { $ROR($zpx()) }, /* 0x76 ROR Zero_Page,X */
		function() { var a = $zp() ; write(a, read(a) & 127) }, /* 0x77 RMB Zero_Page */
		function() { cpu.pfi = 1 }, /* 0x78 SEI Implied */
		function() { $ADC(read($absy())) }, /* 0x79 ADC Absolute,Y */
		function() { setNZ(cpu.y = pop()) }, /* 0x7a PLY Implied */
		function() {  }, /* 0x7b NOP (nonstd loc, implied) */
		function() { cpu.pc = $absxi() }, /* 0x7c JMP (Absolute,X) */
		function() { $ADC(read($absx())) }, /* 0x7d ADC Absolute,X */
		function() { $ROR($absx()) }, /* 0x7e ROR Absolute,X */
		function() { $BRA(!(read($zp()) & 128)) }, /* 0x7f BBR Relative */
		function() { $BRA(1) }, /* 0x80 BRA Relative */
		function() { write($zpxi(), cpu.a) }, /* 0x81 STA (Zero_Page,X) */
		function() { incPC(1) }, /* 0x82 NOP imm (non-std NOP with addr mode) */
		function() {  }, /* 0x83 NOP (nonstd loc, implied) */
		function() { write($zp(), cpu.y) }, /* 0x84 STY Zero_Page */
		function() { write($zp(), cpu.a) }, /* 0x85 STA Zero_Page */
		function() { write($zp(), cpu.x) }, /* 0x86 STX Zero_Page */
		function() { var a = $zp() ; write(a, read(a) | 1) }, /* 0x87 SMB Zero_Page */
		function() { setNZ(cpu.y = (cpu.y - 1) & 0xFF) }, /* 0x88 DEY Implied */
		function() { cpu.pfz = (!(cpu.a & read($imm()))) }, /* 0x89 BIT+ Immediate */
		function() { setNZ(cpu.a = cpu.x) }, /* 0x8a TXA Implied */
		function() {  }, /* 0x8b NOP (nonstd loc, implied) */
		function() { write($abs(), cpu.y) }, /* 0x8c STY Absolute */
		function() { write($abs(), cpu.a) }, /* 0x8d STA Absolute */
		function() { write($abs(), cpu.x) }, /* 0x8e STX Absolute */
		function() { $BRA(  read($zp()) & 1 ) }, /* 0x8f BBS Relative */
		function() { $BRA(!cpu.pfc) }, /* 0x90 BCC Relative */
		function() { write($zpiy(), cpu.a) }, /* 0x91 STA (Zero_Page),Y */
		function() { write($zpi(), cpu.a) }, /* 0x92 STA (Zero_Page) */
		function() {  }, /* 0x93 NOP (nonstd loc, implied) */
		function() { write($zpx(), cpu.y) }, /* 0x94 STY Zero_Page,X */
		function() { write($zpx(), cpu.a) }, /* 0x95 STA Zero_Page,X */
		function() { write($zpy(), cpu.x) }, /* 0x96 STX Zero_Page,Y */
		function() { var a = $zp() ; write(a, read(a) | 2) }, /* 0x97 SMB Zero_Page */
		function() { setNZ(cpu.a = cpu.y) }, /* 0x98 TYA Implied */
		function() { write($absy(), cpu.a) }, /* 0x99 STA Absolute,Y */
		function() { cpu.sp = cpu.x }, /* 0x9a TXS Implied */
		function() {  }, /* 0x9b NOP (nonstd loc, implied) */
		function() { write($abs(), 0) }, /* 0x9c STZ Absolute */
		function() { write($absx(), cpu.a) }, /* 0x9d STA Absolute,X */
		function() { write($absx(), 0) }, /* 0x9e STZ Absolute,X */
		function() { $BRA(  read($zp()) & 2 ) }, /* 0x9f BBS Relative */
		function() { setNZ(cpu.y = read($imm())) }, /* 0xa0 LDY Immediate */
		function() { setNZ(cpu.a = read($zpxi())) }, /* 0xa1 LDA (Zero_Page,X) */
		function() { setNZ(cpu.x = read($imm())) }, /* 0xa2 LDX Immediate */
		function() {  }, /* 0xa3 NOP (nonstd loc, implied) */
		function() { setNZ(cpu.y = read($zp())) }, /* 0xa4 LDY Zero_Page */
		function() { setNZ(cpu.a = read($zp())) }, /* 0xa5 LDA Zero_Page */
		function() { setNZ(cpu.x = read($zp())) }, /* 0xa6 LDX Zero_Page */
		function() { var a = $zp() ; write(a, read(a) | 4) }, /* 0xa7 SMB Zero_Page */
		function() { setNZ(cpu.y = cpu.a) }, /* 0xa8 TAY Implied */
		function() { setNZ(cpu.a = read($imm())) }, /* 0xa9 LDA Immediate */
		function() { setNZ(cpu.x = cpu.a) }, /* 0xaa TAX Implied */
		function() {  }, /* 0xab NOP (nonstd loc, implied) */
		function() { setNZ(cpu.y = read($abs())) }, /* 0xac LDY Absolute */
		function() { setNZ(cpu.a = read($abs())) }, /* 0xad LDA Absolute */
		function() { setNZ(cpu.x = read($abs())) }, /* 0xae LDX Absolute */
		function() { $BRA(  read($zp()) & 4 ) }, /* 0xaf BBS Relative */
		function() { $BRA(cpu.pfc) }, /* 0xb0 BCS Relative */
		function() { setNZ(cpu.a = read($zpiy())) }, /* 0xb1 LDA (Zero_Page),Y */
		function() { setNZ(cpu.a = read($zpi())) }, /* 0xb2 LDA (Zero_Page) */
		function() {  }, /* 0xb3 NOP (nonstd loc, implied) */
		function() { setNZ(cpu.y = read($zpx())) }, /* 0xb4 LDY Zero_Page,X */
		function() { setNZ(cpu.a = read($zpx())) }, /* 0xb5 LDA Zero_Page,X */
		function() { setNZ(cpu.x = read($zpy())) }, /* 0xb6 LDX Zero_Page,Y */
		function() { var a = $zp() ; write(a, read(a) | 8) }, /* 0xb7 SMB Zero_Page */
		function() { cpu.pfv = 0 }, /* 0xb8 CLV Implied */
		function() { setNZ(cpu.a = read($absy())) }, /* 0xb9 LDA Absolute,Y */
		function() { setNZ(cpu.x = cpu.sp) }, /* 0xba TSX Implied */
		function() {  }, /* 0xbb NOP (nonstd loc, implied) */
		function() { setNZ(cpu.y = read($absx())) }, /* 0xbc LDY Absolute,X */
		function() { setNZ(cpu.a = read($absx())) }, /* 0xbd LDA Absolute,X */
		function() { setNZ(cpu.x = read($absy())) }, /* 0xbe LDX Absolute,Y */
		function() { $BRA(  read($zp()) & 8 ) }, /* 0xbf BBS Relative */
		function() { $CMP(cpu.y, read($imm())) }, /* 0xc0 CPY Immediate */
		function() { $CMP(cpu.a, read($zpxi())) }, /* 0xc1 CMP (Zero_Page,X) */
		function() { incPC(1) }, /* 0xc2 NOP imm (non-std NOP with addr mode) */
		function() {  }, /* 0xc3 NOP (nonstd loc, implied) */
		function() { $CMP(cpu.y, read($zp())) }, /* 0xc4 CPY Zero_Page */
		function() { $CMP(cpu.a, read($zp())) }, /* 0xc5 CMP Zero_Page */
		function() { var addr = $zp() ; var data = (read(addr) - 1) & 0xFF ; setNZ(data) ; write(addr, data) }, /* 0xc6 DEC Zero_Page */
		function() { var a = $zp() ; write(a, read(a) | 16) }, /* 0xc7 SMB Zero_Page */
		function() { setNZ(cpu.y = (cpu.y + 1) & 0xFF) }, /* 0xc8 INY Implied */
		function() { $CMP(cpu.a, read($imm())) }, /* 0xc9 CMP Immediate */
		function() { setNZ(cpu.x = (cpu.x - 1) & 0xFF) }, /* 0xca DEX Implied */
		function() {  }, /* 0xcb NOP (nonstd loc, implied) */
		function() { $CMP(cpu.y, read($abs())) }, /* 0xcc CPY Absolute */
		function() { $CMP(cpu.a, read($abs())) }, /* 0xcd CMP Absolute */
		function() { var addr = $abs() ; var data = (read(addr) - 1) & 0xFF ; setNZ(data) ; write(addr, data) }, /* 0xce DEC Absolute */
		function() { $BRA(  read($zp()) & 16 ) }, /* 0xcf BBS Relative */
		function() { $BRA(!cpu.pfz) }, /* 0xd0 BNE Relative */
		function() { $CMP(cpu.a, read($zpiy())) }, /* 0xd1 CMP (Zero_Page),Y */
		function() { $CMP(cpu.a, read($zpi())) }, /* 0xd2 CMP (Zero_Page) */
		function() {  }, /* 0xd3 NOP (nonstd loc, implied) */
		function() { incPC(1) }, /* 0xd4 NOP zpx (non-std NOP with addr mode) */
		function() { $CMP(cpu.a, read($zpx())) }, /* 0xd5 CMP Zero_Page,X */
		function() { var addr = $zpx() ; var data = (read(addr) - 1) & 0xFF ; setNZ(data) ; write(addr, data) }, /* 0xd6 DEC Zero_Page,X */
		function() { var a = $zp() ; write(a, read(a) | 32) }, /* 0xd7 SMB Zero_Page */
		function() { cpu.pfd = 0 }, /* 0xd8 CLD Implied */
		function() { $CMP(cpu.a, read($absy())) }, /* 0xd9 CMP Absolute,Y */
		function() { push(cpu.x) }, /* 0xda PHX Implied */
		function() {  }, /* 0xdb NOP (nonstd loc, implied) */
		function() {  }, /* 0xdc NOP (nonstd loc, implied) */
		function() { $CMP(cpu.a, read($absx())) }, /* 0xdd CMP Absolute,X */
		function() { var addr = $absx() ; var data = (read(addr) - 1) & 0xFF ; setNZ(data) ; write(addr, data) }, /* 0xde DEC Absolute,X */
		function() { $BRA(  read($zp()) & 32 ) }, /* 0xdf BBS Relative */
		function() { $CMP(cpu.x, read($imm())) }, /* 0xe0 CPX Immediate */
		function() { $SBC(read($zpxi())) }, /* 0xe1 SBC (Zero_Page,X) */
		function() { incPC(1) }, /* 0xe2 NOP imm (non-std NOP with addr mode) */
		function() {  }, /* 0xe3 NOP (nonstd loc, implied) */
		function() { $CMP(cpu.x, read($zp())) }, /* 0xe4 CPX Zero_Page */
		function() { $SBC(read($zp())) }, /* 0xe5 SBC Zero_Page */
		function() { var addr = $zp() ; var data = (read(addr) + 1) & 0xFF ; setNZ(data) ; write(addr, data) }, /* 0xe6 INC Zero_Page */
		function() { var a = $zp() ; write(a, read(a) | 64) }, /* 0xe7 SMB Zero_Page */
		function() { setNZ(cpu.x = (cpu.x + 1) & 0xFF) }, /* 0xe8 INX Implied */
		function() { $SBC(read($imm())) }, /* 0xe9 SBC Immediate */
		function() {  }, /* 0xea NOP Implied */
		function() {  }, /* 0xeb NOP (nonstd loc, implied) */
		function() { $CMP(cpu.x, read($abs())) }, /* 0xec CPX Absolute */
		function() { $SBC(read($abs())) }, /* 0xed SBC Absolute */
		function() { var addr = $abs() ; var data = (read(addr) + 1) & 0xFF ; setNZ(data) ; write(addr, data) }, /* 0xee INC Absolute */
		function() { $BRA(  read($zp()) & 64 ) }, /* 0xef BBS Relative */
		function() { $BRA(cpu.pfz) }, /* 0xf0 BEQ Relative */
		function() { $SBC(read($zpiy())) }, /* 0xf1 SBC (Zero_Page),Y */
		function() { $SBC(read($zpi())) }, /* 0xf2 SBC (Zero_Page) */
		function() {  }, /* 0xf3 NOP (nonstd loc, implied) */
		function() { incPC(1) }, /* 0xf4 NOP zpx (non-std NOP with addr mode) */
		function() { $SBC(read($zpx())) }, /* 0xf5 SBC Zero_Page,X */
		function() { var addr = $zpx() ; var data = (read(addr) + 1) & 0xFF ; setNZ(data) ; write(addr, data) }, /* 0xf6 INC Zero_Page,X */
		function() { var a = $zp() ; write(a, read(a) | 128) }, /* 0xf7 SMB Zero_Page */
		function() { cpu.pfd = 1 }, /* 0xf8 SED Implied */
		function() { $SBC(read($absy())) }, /* 0xf9 SBC Absolute,Y */
		function() { setNZ(cpu.x = pop()) }, /* 0xfa PLX Implied */
		function() {  }, /* 0xfb NOP (nonstd loc, implied) */
		function() {  }, /* 0xfc NOP (nonstd loc, implied) */
		function() { $SBC(read($absx())) }, /* 0xfd SBC Absolute,X */
		function() { var addr = $absx() ; var data = (read(addr) + 1) & 0xFF ; setNZ(data) ; write(addr, data) }, /* 0xfe INC Absolute,X */
		function() { $BRA(  read($zp()) & 128 ) }, /* 0xff BBS Relative */
	];
	var opcycles = new Uint8Array([7,6,2,2,5,3,5,5,3,2,2,2,6,4,6,2,2,5,5,2,5,4,6,5,2,4,2,2,6,4,7,2,6,6,2,2,3,3,5,5,4,2,2,2,4,4,6,2,2,5,5,2,4,4,6,5,2,4,2,2,4,4,7,2,6,6,2,2,3,3,5,5,3,2,2,2,3,4,6,2,2,5,5,2,4,4,6,5,2,4,3,2,2,4,7,2,6,6,2,2,3,3,5,5,4,2,2,2,5,4,6,2,2,5,5,2,4,4,6,5,2,4,4,2,6,4,7,2,3,6,2,2,3,3,3,5,2,2,2,2,4,4,4,2,2,6,5,2,4,4,4,5,2,5,2,2,4,5,5,2,2,6,2,2,3,3,3,5,2,2,2,2,4,4,4,2,2,5,5,2,4,4,4,5,2,4,2,2,4,4,4,2,2,6,2,2,3,3,5,5,2,2,2,2,4,4,6,2,2,5,5,2,4,4,6,5,2,4,3,2,2,4,7,2,2,6,2,2,3,3,5,5,2,2,2,2,4,4,6,2,2,5,5,2,4,4,6,5,2,4,4,2,2,4,7,2]);
	cpu.step = function () {
		if (/* begin ins block: NMICOND for 65C02 */ cpu.nmiEdge /* end ins block */) {
			cpu.nmiEdge = 0;
			pushWord(cpu.pc);
			push(getP());
			cpu.pfi = 1;
			cpu.pfd = 0;
			cpu.pc = readWord(0xFFFA);
			return 7;
		}
		if (/* begin ins block: IRQCOND for 65C02 */ cpu.irqLevel && (!cpu.pfi) /* end ins block */) {
			//console.log("IRQ");
			pushWord(cpu.pc);
			cpu.pfb = 0;
			push(getP());
			cpu.pfi = 1;
			cpu.pfd = 0;
			cpu.pc = readWord(0xFFFE);
			return 7;
		}
		cpu.old_pc = cpu.pc;
		cpu.op = read(cpu.pc);
		cycles = opcycles[cpu.op];
		incPC(1);
		opcodes[cpu.op]();
		if ((cpu.a & 0xFF) != cpu.a) {
			alert("Invalid A ... pc = " + cpu.old_pc.toString(16));
			cpu.fatal = true;
		}
		return cycles;
	};
	return cpu;
}

