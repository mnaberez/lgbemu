/* Quick&dirty 6551 ACIA emulation
 * (C)2013 LGB Gabor Lenart
 * Note: this is not an exact nor complete emulation!
 * The only goal is to support what Commodore LCD uses even
 * implemented incorrectly (not cycle exact, simplified, ignored
 * conditions, etc). */

"use strict";

function ACIA(name) {
	var acia = {name: name};
	var CTRL, CMD, STATUS;
	var rxData,txData;
	var bitc = 0;
	var bitcRate = 416;
	var irqLevel;
	acia.reset = function () {
		CTRL = 0;
		CMD = 0;
		STATUS = 16;
		rxData = 0;
		txData = -1;
		irqLevel = false;
		acia.intchg(false);
		console.log(name + ": RESET");
	};
	function checkStatus() {
		if (
			(CMD & 1) && (
				((!(CMD & 2)) && (STATUS & 8))
				||
				(((!(CMD & 8)) && (CMD & 4)) && (STATUS & 16))
			)
		) {
			STATUS |= 128;
			if (!irqLevel) {
				console.log(name + ": IRQ on");
				irqLevel = true;
				acia.intchg(true);
			}
		} else {
			STATUS &= 127;
			if (irqLevel) {
				console.log(name + ": IRQ off");
				irqLevel = false;
				acia.intchg(false);
			}
		}
	}
	function setStatus(mask) {
		STATUS |= mask;
		checkStatus();
	}
	function clearStatus(mask) {
		STATUS &= 255 - mask;
		checkStatus();
	}
	acia.tick = function (ticks) {
		bitc -= ticks;
		if (bitc < 0) {
			var rx = acia.rx();
			if (rx > -1) {
				rxData = rx;
				setStatus(8); // receiver is full
			}
			if (txData != -1) {
				acia.tx(txData);
				txData = -1;
				setStatus(16); // now txregister is empty!
			}
			bitc = bitcRate;
		}
	};
	acia.read = function (addr) {
		//console.log(name + ": read #" + addr);
		if (addr == 0) { clearStatus(8); return rxData; } // receiver data register
		else if (addr == 1) { var ret = STATUS; STATUS = 0; checkStatus(); return ret; } // status register
		else if (addr == 2) return CMD; // command register
		else return CTRL; // control register
	};
	acia.write = function (addr, data) {
		console.log(name + ": write #" + addr + " " + data);
		if (addr == 0) {txData = data;  clearStatus(16) } // transmit data register
		else if (addr == 1) { // programmed reset (data is not important!)
			CMD = (CMD & 224) | 2;
			STATUS &= 251;
			checkStatus();
		}
		else if (addr == 2) { CMD = data; checkStatus() } // command register
		else CTRL = data; // control register
	};
	//acia.fill = function ( buffer ) {}; // fills the receiver buffer. NOTE: real ACIA has no buffer but a single register. This is only for easier emu.
	acia.intchg = function (level) { console.log(name + ": unhandled IRQ!") }; // this should be re-defined
	acia.rx = function () { console.log(name + ": READ RX!"); return -1; }; // this should be re-defined
	acia.tx = function (data) { console.log(name + ": WRITE TX!"); }; // this should be re-defined
	acia.reset();
	return acia;
}

function ACIAdemo(acia) {
	var data = -1;
	if (acia.demoOK != undefined) return;
	acia.demoOK = true;
	acia.tx = function (d) {
		data = d;
	};
	acia.rx = function () {
		if (data == -1) return -1;
		var ret = (data + 13) & 0xFF;
		data = -1;
		return ret;
	};
	var old_reset = acia.reset;
	acia.reset = function () {
		old_reset();
		data = -1;
	};
}
