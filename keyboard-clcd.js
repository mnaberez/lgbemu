/* Quick&dirty 6522 VIA emulation
 * (C)2013 LGB Gabor Lenart
 * Note: this is not an exact nor complete emulation!
 * The only goal is to support what Commodore LCD uses even
 * implemented incorrectly (not cycle exact, simplified, ignored
 * conditions, etc). */

"use strict";



/* rest of the file: preliminary kbd support, the code mostly
 * cut&pasted from my Enterprise-128 emulator project with minor
 * modifications. It should be re-constructed ... */


var KBD_RESET_ON_UNKNOWN = "yes";
function keyboardReset() {
        for (var a = 0; a < 8; a++)
                kbdMatrix[a] = 0;
}

var keyCodes = {
	  8: [0, 0],	// delete?
	 13: [0, 1],	// RETURN?
	  9: [0, 2],	// TAB?
	118: [0, 3],   // F7
	112: [0, 4],   // F1
	114: [0, 5],	// F3
	116: [0, 6],	// F5
	219: [0, 7],  // @  mapped to '['
	 51: [1, 0],	// 3
	 87: [1, 1],	// W
	 65: [1, 2], // A
	 52: [1, 3], // 4
	 90: [1, 4], // Z
	 83: [1, 5], // S
	 69: [1, 6], // E
	115: [1, 7], // F4
	 53: [2, 0], // %/5 ?!?!
	 82: [2, 1], // R
	 68: [2, 2], // D
	 54: [2, 3], // &/6 ?!
	 67: [2, 4], // C
	 70: [2, 5], // F
	 84: [2, 6], // T
	 88: [2, 7], // X
	 55: [3, 0], // 7
	 89: [3, 1], // Y
	 71: [3, 2], // G
	 56: [3, 3], // 8
	 66: [3, 4], // B
	 72: [3, 5], // H
	 85: [3, 6], // U
	 86: [3, 7], // V
	 57: [4, 0], // )/9?!
	 73: [4, 1], // I/_ ?!
	 74: [4, 2], // J/?!
	 48: [4, 3], // 0/~ ?!
	 77: [4, 4], // M
	 75: [4, 5], // K
	 79: [4, 6], // O
	 78: [4, 7], // N
	 40: [5, 0], // DOWN
	 80: [5, 1], // P
	 76: [5, 2], // L
	 38: [5, 3], // UP
	190: [5, 4], // .
	186: [5, 5], // :
	189: [5, 6], // -
	188: [5, 7], // ,
	 37: [6, 0],   // LEFT
	221: [6, 1],	  // *, mapped to: ]
	222: [6, 2],   // ;
	 39: [6, 3],	  // RIGHT
	 27: [6, 4],	  // ESC
	187: [6, 5],	  // =
	220: [6, 6],	  // + mapped to \ 
	191: [6, 7],	  // /
	 49: [7, 0], // 1
	 36: [7, 1], // HOME?
	113: [7, 2], // F2?
	 50: [7, 3], // 2
	 32: [7, 4], // SPACE
	119: [7, 5], // F8?
	 81: [7, 6], // Q
	117: [7, 7],  // F6?
	/* ehhh, not the general matrix, battery status etc is here too: */
	 18: [4, 8],	// commodore? (mapped to ALT on PC kbd)
	 17: [3, 8],	// ctrl?
	 16: [2, 8],   // da shift?
	 20: [1, 8],	// caps lock? [cursor is ^]
	 35: [0, 8],	// stop? (mapped to "end" on PC kbd)
};

/* ugly hack to compensate cross-browser incompatibility and possible kbd layout differences later */
function keyPreTrans(evt) {
	var kc = evt.keyCode;
	if (kc == 0) {
		kc = evt.charCode;
		if (kc == 233) return 186; // Hungarian é to ;
		if (kc == 225) return 222; // Hungarian á is used for :
		return 0; // not found by charCode, return zero
	}
	// firefox does some things totally different way than rest of the browsers:
	if (kc ==  59) return 186; // firefox workaround
	if (kc == 107) return 187; // firefox workaround
	if (kc == 109) return 189; // firefox workaround
	return kc;
}


function kbdinfo(msg) {
	document.getElementById("kbddec").innerHTML = msg.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt");
}


function keyDown(evt) {
	//if (!running) return;
	/*if (evt.keyCode == 0) {
		keyboardReset();
		kbdinfo("KEY 0 GOT, resetting kbd!");
		return;
	}*/
	var keyCode = keyCodes[keyPreTrans(evt)];
	var kid = evt.keyCode + "/" + evt.charCode + "/" + evt.which;
	if (keyCode == null) {
		kbdinfo("KEY v [" + kid + "] UNKNOWN TO MAP");
		return false; // well anyway ...
	}
	kp(keyCode[0], keyCode[1]);
	//keyStates[keyCode.row] &= ~(keyCode.mask);
	kbdinfo("KEY v [" + kid + "] x=" + keyCode[0] + " y=" + keyCode[1]);
	return false; // false is needed here not to pass controll to the browser!
}


function keyPress(evt) {
	//if (!running) return;
	var keyCode = keyCodes[keyPreTrans(evt)];
	var kid = evt.keyCode + "/" + evt.charCode + "/" + evt.which;
	if (keyCode == null) {
		kbdinfo("KEY # [" + kid + "] UNKNOWN TO MAP");
		return false; // well anyway ...
	}
	kp(keyCode[0], keyCode[1]);
	kbdinfo("KEY # [" + kid + "] x=" + keyCode[0] + " y=" + keyCode[1]);
	return false; // false is needed here not to pass controll to the browser!
}


function keyUp(evt) {
	//if (!running) return;
	var keyCode = keyPreTrans(evt);
	var kid = evt.keyCode + "/" + evt.charCode + "/" + evt.which;
	if (keyCode == 0 && KBD_RESET_ON_UNKNOWN == "yes") {
		/* that's ugly, but it seems, shift stucks on Chrome without this hack [interestingly only on ONE of my machines, not the other with same browser/OS!] :( */
		keyboardReset();
		kbdinfo("KEY 0 GOT [" + kid + "], resetting kbd!");
		return false;
	}
	keyCode = keyCodes[keyCode];
	if (keyCode == null) {
		kbdinfo("KEY ^ [" + kid + "] UNKNOWN TO MAP");
		return false;
	}
	//keyStates[keyCode.row] |= keyCode.mask;
	kp(keyCode[0], keyCode[1], true);
	kbdinfo("KEY ^ [" + kid + "] x=" + keyCode[0] + " y=" + keyCode[1]);
	return false;
}




