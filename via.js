/* Quick&dirty 6522 VIA emulation
 * (C)2013 LGB Gabor Lenart
 * Note: this is not an exact nor complete emulation!
 * The only goal is to support what Commodore LCD uses even
 * implemented incorrectly (not cycle exact, simplified, ignored
 * conditions, etc). */

"use strict";

function VIA(name) {
	var via = {name: name};
	var DDRB, ORB, DDRA, ORA, SR, IER, IFR, ACR, PCR, T1C, T2C, T1LL, T1LH, T2LL, T2LH;
	var irqLevel, SR, SRcount, SRmode, T1run, T2run;
	via.reset = function () {
		ORA = ORB = DDRA = DDRB = 0;
		SR = SRcount = SRmode = IER = IFR = ACR = PCR = 0;
		T1C = T2C = T1LL = T1LH = T2LL = T2LH = 0;
		irqLevel = T1run = T2run = false;
		via.intchg(irqLevel);
		console.log(name + ": RESET");
	};
	via.ora = function () { return ORA };
	via.orb = function () { return ORB };
	function ifr_check() {
		if (IFR & IER & 127) {
			IFR |= 128;
			if (!irqLevel) { irqLevel = true ; via.intchg(true) }
		} else {
			IFR &= 127;
			if (irqLevel) { irqLevel = false ; via.intchg(false) }
		}
	}
	function ifr_clear(mask) { IFR &= 255 - mask; ifr_check() }
	function ifr_set(mask)   { IFR |=       mask; ifr_check() }
	function ifr_on_pa() { ifr_clear(((PCR & 0x0E) in [0x02, 0x06]) ?    2 :    3); }
	function ifr_on_pb() { ifr_clear(((PCR & 0xE0) in [0x20, 0x60]) ? 0x10 : 0x18); }
	function ina() {
		ifr_on_pa();
		return via.ina(0xFF);
	}
	function inb() {
		ifr_on_pb();
		return ORB & DDRB | via.inb(255 - DDRB) & (255 - DDRB);
	}
	function outa(data) {
		ORA = data;
		if (DDRA) via.outa(ORA, DDRA);
		ifr_on_pa();
	}
	function outb(data) {
		ORB = data;
		if (DDRB) via.outb(ORB, DDRB);
		ifr_on_pb();
	}
	var viaReadFuncs = [
		inb, // reg#0: port B data
		ina, // reg#1: port A data
		function () { return DDRB }, // reg#2: DDR B
		function () { return DDRA }, // reg#3: DDR A
		function () { ifr_clear(64) ; return T1C & 0xFF }, // reg#4:
		function () { return T1C >> 8 }, // reg#5:
		function () { return T1LL }, // reg#6:
		function () { return T1C >> 8 }, // reg#7:
		function () { ifr_clear(32) ; return T2C & 0xFF }, // reg#8:
		function () { return T2C >> 8 }, // reg#9:
		function () { ifr_clear(4) ; if (SRmode) { SRcount = 8 } ; return SR }, // reg#A: SR
		function () { return ACR }, // reg#B: ACR
		function () { return PCR }, // reg#C: PCR
		function () { return IFR }, // reg#D: IFR
		function () { return IER | 128 }, // reg#E: IER
		ina  // reg#F:
	];
	var viaWriteFuncs = [
		outb, // reg#0: port B
		outa, // reg#1: port A
		function (data) { console.log(name + ": DDRB=$" + data.toString(16)) ; if (DDRB != data) { DDRB=data ; outb(ORB) } }, // reg#2: DDR B
		function (data) { console.log(name + ": DDRA=$" + data.toString(16)) ; if (DDRA != data) { DDRA=data ; outa(ORA) } }, // reg#3: DDR A
		function (data) { T1LL = data }, // reg#4:
		function (data) { T1LH = data ; ifr_clear(64) ; T1run = true ; T1C = T1LL | (T1LH << 8) }, // reg#5:
		function (data) { T1LL = data }, // reg#6:
		function (data) { T1LH = data ; ifr_clear(64) }, // reg#7:
		function (data) { T2LL = data }, // reg#8:
		function (data) { T2LH = data ; ifr_clear(32) ; T2run = true ; T2C = T2LL | (T2LH << 8) }, // reg#9:
		function (data) { ifr_clear(4) ; SR = data ; if (SRmode) SRcount = 8 }, // reg#A: SR
		function (data) {
			SRmode = (data >> 2) & 7;
			ACR = data;
			if (data & 32) alert(name + ": pulse counting T2 mode is not supported!");
		}, // reg#B: ACR
		function (data) { PCR = data }, // reg#C: PCR
		function (data) { ifr_clear(data) }, // reg#D: IFR
		function (data) {
			if (data & 128) IER |= data; else IER &= (255 - data);
			ifr_check();
		}, // reg#E: IER
		outa  // reg#F:
	];
	function logit(msg) {
		//console.log(name + ": " + msg + " @ $" + cpu.old_pc.toString(16));
	}
	via.ina = function(mask) { logit("ina() is not defined!") ; return 0xFF }; // should be re-defined
	via.inb = function(mask) { logit("inb() is not defined!") ; return 0xFF }; // should be re-defined
	via.outa = function(data, mask) { logit("outa() is not defined!") }; // should be re-defined
	via.outb = function(data, mask) { logit("outb() is not defined!") }; // should be re-defined
	via.insr = function() { logit("insr() is not defined!") ; return 0xFF }; // should be re-defined
	via.outsr = function(data) { logit("outsr() is not defined!") }; // should be re-defined
	via.intchg = function (level) {}; // should be re-defined
	via.read = function (addr) {
		//console.log(name + " read " + addr);
		return viaReadFuncs[addr]();
	};
	via.write = function (addr, data) {
		//console.log(name + " write " + addr + " " + data);
		viaWriteFuncs[addr](data);
	};
	via.tick = function (ticks) {
		/* T1 */
		if (T1run) {
			T1C -= ticks;
			if (T1C <= 0) {
				//console.log("Expired T1");
				ifr_set(64)
				if (ACR & 64) T1C = T1LL | (T1LH << 8); else T1run = false;
			}
		}
		/* T2 */
		T2C -= ticks;
		if (T2run) {
			if (T2C <= 0) {
				ifr_set(32);
				T2run = false;
			}
		}
		T2C &= 0xFFFF;
		/* shift register */
		if (SRcount) {
			SRcount -= ticks;
			if (SRcount <= 0) {
				switch(SRmode) {
					case 0: SRcount = 0; ifr_clear(4); break; // disabled
					case 2: SR = via.insr(); SRcount = 0; ifr_set(4); break; // PHI2-in
					case 4: via.outsr(SR); SRcount = T2LL + 2; ifr_clear(4); break; // free-T2-out, VIA2 seems to use this mode!
					default: SRcount = 0 ; ifr_clear(4); alert(name + ": SRmode = " + SRmode + " is not supported!"); break;
				}
			}
		}
	};
	via.reset();
	return via;
}
