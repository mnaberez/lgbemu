/* Quick&dirty IEC bus and "floppy drive" emulator translating into AJAX calls.
 * (C)2013,2014 LGB Gabor Lenart
 * Note: this is not an exact nor complete emulation!
 * The only goal is to support what Commodore LCD uses even
 * implemented incorrectly (not cycle exact, simplified, ignored
 * conditions, etc). */

"use strict";

function NETIEC(name, devid) {
	var iec = {};
	var clkCBM = false, datCBM = false, atnOLD = false;
	var clkBUS, datBUS, clkDRV, datDRV, atn = false;
	var state, clkOLD;
	var hacky = -1, eoi;
	var timeoutFunction, cycles = undefined;
	var byte, bitc;
	var buffer;
	name = name + "[" + devid + "]";
	iec.reset = function () {
		clk(false);
		dat(false);
		state = 0;
		buffer = [];
		hacky++;
		cancelTimeout();
		console.log(name + ": RESET");
	};
	function clk(v) {
		clkDRV = v;
		clkBUS = clkDRV || clkCBM;
	}
	function dat(v) {
		datDRV = v;
		datBUS = datDRV || datCBM;
	}
	function setTimeout(usecs, func) {
		cycles = usecs;
		timeoutFunction = func;
		console.log(name + ": timeout function is set up with " + usecs + "uSecs.");
	}
	iec.tick = function (n) {
		if (cycles != undefined) {
			cycles -= n;
			if (cycles <= 0) {
				cycles = undefined;
				console.log(name + ": timeout function is about being called now");
				timeoutFunction();
			}
		}
	};
	function cancelTimeout() {
		if (cycles != undefined)
			console.log(name + ": timeout function is being canceled.");
		cycles = undefined;
	}
	
	
	iec.busEvent = function (_atn, _clk, _dat) {
		atnOLD = atn;
		clkOLD = clkBUS;
		atn    = _atn ? true : false;
		clkCBM = _clk ? true : false;
		datCBM = _dat ? true : false;
		clkBUS = clkDRV || clkCBM;
		datBUS = datDRV || datCBM;
		if (hacky || 1)
			console.log(name + ": EVENT: atn = " + atn + " data = " + datBUS + " clock = " + clkBUS + " STATE = " + state);
		if (!atnOLD && atn) {
			console.log(name + ": ATN goes ACTIVE");
			dat(true); // pull down data line as we are the listener as the response of the ATN
			clk(false); // release clk line (as maybe we were in iec-turnaround mode)
			state = 0;
			cancelTimeout();
			buffer = [];
		}
		if (atnOLD && !atn)
			console.log(name + ": ATN released");
		if (state == 0) {
			if (!clkBUS) { // talker releases clock line
				dat(false); // as response, listner releases data line
				if (datBUS)
					console.log(name + ": !!!!!! ***** IEC turnaround requested! #1");
				else    console.log(name + "IEC turnaround CP, data = " + datBUS + " clock = " + clkBUS);
				state = 1;
				// set up timeout functions for EOI detection
				setTimeout(200, function () { // this is the EOI here
					console.log(name + ": EOI ack");
					eoi = true;
					dat(true);
					state = -1; // unused step for the following wait of DAT pulse (EOI ack)
					setTimeout(60, function () { // 60usec data pulse to ACK EOI
						dat(false);
						state = 2;
						byte = 0;
						bitc = 0;
					});
				});
			}
		} else if (state == 1) {
			// NOTE: if data line is STILL pulled low, it must be the computer wanna iec turnaround!
			if (datBUS)
				console.log(name + ": !!!!!! ***** IEC turnaround requested! #2");
			if (clkBUS) { // talker pulls clock line true (also the previously installed timeout func may apply)
				//dat(true); // IT IS AN ERROR, I guess ...
				state = 2;
				byte = 0;
				bitc = 0;
				cancelTimeout(); // cancel timeout function, not an EOI condition!
				eoi = false;
			}
		} else if (state == 2) {
			dat(false); // not needed ...
			// TODO: add timeout not to wait forever here for a byte in case of an abnormal end of transmission
			if (!clkBUS && clkOLD) {
				console.log(name + ": xfer [bit#"+bitc+"], data = " + datBUS + " clock = " + clkBUS);
				byte = (byte >> 1) | (datBUS ? 0x00 : 0x80);
				if (bitc == 7) {
					buffer.push(byte);
					console.log(name + ": BYTE READ: " + byte);
					dat(true); // ACK the byte
					state = 0;
					if (eoi) {
						console.log("WE GOT: " + buffer);
						buffer = [];
					}
				} else bitc++;
			}
		}
	};
	
	
	var oldRetVal = -1;
	iec.busRead = function (_clkM, _datM) {
		/* now "format" the answer signals for the caller */
		var val = (clkBUS ? 0 : _clkM) | (datBUS ? 0 : _datM);
		if (val != oldRetVal) {
			console.log(name + ": read value changed on IEC bus = " + val);
			oldRetVal = val;
		}
		return val;
	};
	iec.reset();
	return iec;
}
