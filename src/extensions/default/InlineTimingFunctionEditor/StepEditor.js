/*
 * Copyright (c) 2013 Adobe Systems Incorporated. All rights reserved.
 *  
 * Permission is hereby granted, free of charge, to any person obtaining a
 * copy of this software and associated documentation files (the "Software"), 
 * to deal in the Software without restriction, including without limitation 
 * the rights to use, copy, modify, merge, publish, distribute, sublicense, 
 * and/or sell copies of the Software, and to permit persons to whom the 
 * Software is furnished to do so, subject to the following conditions:
 *  
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *  
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, 
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER 
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING 
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER 
 * DEALINGS IN THE SOFTWARE.
 * 
 */

/*jslint vars: true, plusplus: true, nomen: true, regexp: true, maxerr: 50 */
/*global define, brackets, $, window, Mustache */

define(function (require, exports, module) {
    "use strict";
    
    var EditorManager   = brackets.getModule("editor/EditorManager"),
        KeyEvent        = brackets.getModule("utils/KeyEvent"),
        Strings         = brackets.getModule("strings");

    var TimingFunctionUtils            = require("TimingFunctionUtils"),
        InlineTimingFunctionEditor     = require("InlineTimingFunctionEditor").InlineTimingFunctionEditor;
    
    /** Mustache template that forms the bare DOM structure of the UI */
    var StepEditorTemplate   = require("text!StepEditorTemplate.html");
    
    /** @const @type {number} */
    var STEP_LINE       =   1,
        DASH_LINE       =   2,
        HEIGHT_ABOVE    =  75,      // TODO: remove
        HEIGHT_BELOW    =  75,      // TODO: remove
        HEIGHT_MAIN     = 150,    // height of main grid
        WIDTH_MAIN      = 150;    // width of main grid

    var animationRequest = null;

    /**
     * StepParameters object constructor
     *
     * @param {{ count: number, timing: string}} params Parameters passed to steps()
     *      either in string or array format.
     */
    function StepParameters(params) {
        if (!params) {
            throw "No parameters were defined";
        }

        this.count  = params.count;
        this.timing = params.timing;
    }
    
    /**
     * StepCanvas object constructor
     *
     * @param {Element} canvas Inline editor <canvas> element
     * @param {StepParameters} stepParams Associated StepParameters object
     * @param {number|Array.number} padding Element padding
     */
    function StepCanvas(canvas, stepParams, padding) {
        this.canvas     = canvas;
        this.stepParams = stepParams;
        this.padding    = this.getPadding(padding);

        // Convert to a cartesian coordinate system with axes from 0 to 1
        var ctx = this.canvas.getContext("2d"),
            p = this.padding;

        ctx.scale(canvas.width * (1 - p[1] - p[3]), -canvas.height * (1 - p[0] - p[2]));
        ctx.translate(p[3] / (1 - p[1] - p[3]), (-1 - p[0] / (1 - p[0] - p[2])));
    }

    StepCanvas.prototype = {

        drawPoint: function (x, y, isFilled) {
            // Points are always step color
            this.ctx.beginPath();
            this.ctx.lineWidth   = this.settings.pointLineWidth;
            this.ctx.strokeStyle = this.settings.stepColor;
            this.ctx.arc(x, y, this.settings.pointRadius, 0, 2 * Math.PI, false);
            this.ctx.stroke();
            if (isFilled) {
                this.ctx.fillStyle = this.settings.stepColor;
                this.ctx.fill();
            }
            this.ctx.closePath();
        },

        drawLine: function (x1, y1, x2, y2, type) {
            this.ctx.beginPath();
            if (type === STEP_LINE) {
                this.ctx.lineWidth   = this.settings.stepLineWidth;
                this.ctx.strokeStyle = this.settings.stepColor;
            } else if (type === DASH_LINE) {
                this.ctx.lineWidth   = this.settings.dashLineWidth;
                this.ctx.strokeStyle = this.settings.dashColor;
            }
            this.ctx.moveTo(x1, y1);
            this.ctx.lineTo(x2, y2);
            this.ctx.stroke();
            this.ctx.closePath();
        },

        drawStartInterval: function (x1, y1, x2, y2) {
            var pr = this.settings.pointRadius;

            // Draw empty start point
            this.drawPoint(x1, y1, false);

            // Draw dashed line up to next step
            this.drawLine(x1, y1 + pr, x1, y2, DASH_LINE);

            // Draw filled mid point
            this.drawPoint(x1, y2, true);

            // Draw step line
            this.drawLine(x1, y2, x2 - pr, y2, STEP_LINE);
        },

        drawEndInterval: function (x1, y1, x2, y2) {
            var pr = this.settings.pointRadius;

            // Draw filled start point
            this.drawPoint(x1, y1, true);

            // Draw step line
            this.drawLine(x1, y1, x2 - pr, y1, STEP_LINE);

            // Draw empty mid point
            this.drawPoint(x2, y1, false);

            // Draw dashed line up to next step
            this.drawLine(x2, y1 + pr, x2, y2, DASH_LINE);
        },

        /**
         * Paint canvas
         *
         * @param {Object} settings Paint settings
         */
        plot: function (settings) {
            var setting, i, j, last, interval,
                sp = this.stepParams,
                isStart = (sp.timing === "start"),
                p = [];

            var defaultSettings = {
                stepColor: "#1461fc",
                dashColor: "#b8b8b8",
                stepLineWidth:  0.02,
                dashLineWidth:  0.008,
                pointLineWidth: 0.008,
                pointRadius:    0.015
            };

            this.settings = settings || {};

            for (setting in defaultSettings) {
                if (defaultSettings.hasOwnProperty(setting)) {
                    if (!this.settings.hasOwnProperty(setting)) {
                        this.settings[setting] = defaultSettings[setting];
                    }
                }
            }

            this.ctx = this.canvas.getContext("2d");

            // Build points array. There's a starting point at 0,0
            // plus a point for each step
            p[0] = { x: 0, y: 0 };
            for (i = 1; i <= sp.count; i++) {
                interval = i / sp.count;
                p[i] = { x: interval, y: interval };
            }

            // Start with a clean slate
            this.ctx.clearRect(-0.1, -0.1, 1.1, 1.1);

            // Draw each interval
            last = p.length - 1;
            for (i = 0, j = 1; i < last; i++, j++) {
                if (isStart) {
                    this.drawStartInterval(p[i].x, p[i].y, p[j].x, p[j].y);
                } else {
                    this.drawEndInterval(p[i].x, p[i].y, p[j].x, p[j].y);
                }
            }

            // Draw last point. It's always filled.
            this.drawPoint(p[last].x, p[last].y, true);
        },

        /**
         * Convert CSS padding shorthand to longhand
         *
         * @param {number|Array.number} padding Element padding
         * @return {Array.number}
         */
        getPadding: function (padding) {
            var p = (typeof padding === "number") ? [padding] : padding;

            if (p.length === 1) {
                p[1] = p[0];
            }
            if (p.length === 2) {
                p[2] = p[0];
            }
            if (p.length === 3) {
                p[3] = p[1];
            }

            return p;
        }
    };

    // Event handlers
    
    /**
     * Handle click in <canvas> element
     *
     * @param {Event} e Mouse click event
     */
/*
    function _canvasClick(e) {
        var self = e.target,
            stepEditor = self.stepEditor;

        var curveBoundingBox = stepEditor._getCanvasBoundingBox(),
            left = curveBoundingBox.left,
            top  = curveBoundingBox.top,
            x    = e.pageX - left,
            y    = e.pageY - top - HEIGHT_ABOVE,
            $P1  = $(stepEditor.P1),
            $P2  = $(stepEditor.P2);

        // Helper function to calculate distance between 2-D points
        function distance(x1, y1, x2, y2) {
            return Math.sqrt(Math.pow(x1 - x2, 2) + Math.pow(y1 - y2, 2));
        }

        // Find which point is closer
        var distP1 = distance(x, y, parseInt($P1.css("left"), 10), parseInt($P1.css("top"), 10)),
            distP2 = distance(x, y, parseInt($P2.css("left"), 10), parseInt($P2.css("top"), 10)),
            $P     = (distP1 < distP2) ? $P1 : $P2;

        $P.css({
            left: x + "px",
            top:  y + "px"
        });
        $P.get(0).focus();

        // update coords
        stepEditor._stepParams = stepEditor.stepCanvas
            .offsetsToCoordinates(stepEditor.P1)
            .concat(stepEditor.stepCanvas.offsetsToCoordinates(stepEditor.P2));

        stepEditor._commitTimingFunction();
        stepEditor._updateCanvas();
    }
*/

    /**
     * Helper function for handling point move
     *
     * @param {Event} e Mouse move event
     * @param {number} x New horizontal position
     * @param {number} y New vertical position
     */
/*
    function handlePointMove(e, x, y) {
        var self = e.target,
            stepEditor = self.stepEditor;

        // Helper function to redraw curve
        function mouseMoveRedraw() {
            if (!stepEditor.dragElement) {
                animationRequest = null;
                return;
            }

            // Update code
            stepEditor._commitTimingFunction();

            stepEditor._updateCanvas();
            animationRequest = window.webkitRequestAnimationFrame(mouseMoveRedraw);
        }

        // This is a dragging state, but left button is no longer down, so mouse
        // exited element, was released, and re-entered element. Treat like a drop.
        if (stepEditor.dragElement && (e.which !== 1)) {
            stepEditor.dragElement = null;
            stepEditor._commitTimingFunction();
            stepEditor._updateCanvas();
            stepEditor = null;
            return;
        }

        // Constrain time (x-axis) to 0 to 1 range. Progression (y-axis) is
        // theoretically not constrained, although canvas to drawing curve is
        // arbitrarily constrained to -0.5 to 1.5 range.
        x = Math.min(Math.max(0, x), WIDTH_MAIN);

        if (stepEditor.dragElement) {
            $(stepEditor.dragElement).css({
                left: x + "px",
                top:  y + "px"
            });
        }

        // update coords
//        stepEditor._stepParams = stepEditor.stepCanvas
//            .offsetsToCoordinates(stepEditor.P1)
//            .concat(stepEditor.stepCanvas.offsetsToCoordinates(stepEditor.P2));
        stepEditor._stepParams = stepEditor.stepCanvas.stepParams;

        if (!animationRequest) {
            animationRequest = window.webkitRequestAnimationFrame(mouseMoveRedraw);
        }
    }
*/

    /**
     * Update Time (x-axis) and Progression (y-axis) data for mouse position
     *
     * @param {Element} canvas <canvas> element
     * @param {number} x Horizontal position
     * @param {number} y Vertical position
     */
/*
    function updateTimeProgression(curve, x, y) {
        curve.parentNode.setAttribute("data-time", Math.round(100 * x / WIDTH_MAIN));
        curve.parentNode.setAttribute("data-progression", Math.round(100 * ((HEIGHT_MAIN - y) / HEIGHT_MAIN)));
    }
*/

    /**
     * Handle mouse move in <canvas> element
     *
     * @param {Event} e Mouse move event
     */
/*
    function _canvasMouseMove(e) {
        var self = e.target,
            stepEditor = self.stepEditor,
            curveBoundingBox = stepEditor._getCanvasBoundingBox(),
            left   = curveBoundingBox.left,
            top    = curveBoundingBox.top,
            x = e.pageX - left,
            y = e.pageY - top - HEIGHT_ABOVE;

        updateTimeProgression(self, x, y);

        if (stepEditor.dragElement) {
            if (e.pageX === 0 && e.pageY === 0) {
                return;
            }

            handlePointMove(e, x, y);
        }
    }
*/

    /**
     * Handle mouse move in <button> element
     *
     * @param {Event} e Mouse move event
     */
/*
    function _pointMouseMove(e) {
        var self = e.target,
            stepEditor = self.stepEditor,
            curveBoundingBox = stepEditor._getCanvasBoundingBox(),
            left = curveBoundingBox.left,
            top  = curveBoundingBox.top,
            x = e.pageX - left,
            y = e.pageY - top - HEIGHT_ABOVE;

        updateTimeProgression(stepEditor.canvas, x, y);

        if (e.pageX === 0 && e.pageY === 0) {
            return;
        }

        handlePointMove(e, x, y);
    }
*/

    /**
     * Handle mouse down in <button> element
     *
     * @param {Event} e Mouse down event
     */
/*
    function _pointMouseDown(e) {
        var self = e.target;

        self.stepEditor.dragElement = self;
    }
*/

    /**
     * Handle mouse up in <button> element
     *
     * @param {Event} e Mouse up event
     */
/*
    function _pointMouseUp(e) {
        var self = e.target;

        self.focus();

        if (self.stepEditor.dragElement) {
            self.stepEditor.dragElement = null;
            self.stepEditor._commitTimingFunction();
            self.stepEditor._updateCanvas();
        }
    }
*/

    /**
     * Handle key down in <canvas> element
     *
     * @param {Event} e Key down event
     */
    function _canvasKeyDown(e) {
/*
        var code = e.keyCode,
            self = e.target,
            stepEditor = self.stepEditor;

        if (code >= KeyEvent.DOM_VK_LEFT && code <= KeyEvent.DOM_VK_DOWN) {
            e.preventDefault();

            // Arrow keys pressed
            var $this = $(e.target),
                left = parseInt($this.css("left"), 10),
                top  = parseInt($this.css("top"), 10),
                offset = (e.shiftKey ? 15 : 3),
                newVal;

            switch (code) {
            case KeyEvent.DOM_VK_LEFT:
                newVal = Math.max(0, left - offset);
                if (left === newVal) {
                    return false;
                }
                $this.css({ left: newVal + "px" });
                break;
            case KeyEvent.DOM_VK_UP:
                newVal = Math.max(-HEIGHT_ABOVE, top - offset);
                if (top === newVal) {
                    return false;
                }
                $this.css({ top: newVal + "px" });
                break;
            case KeyEvent.DOM_VK_RIGHT:
                newVal = Math.min(WIDTH_MAIN, left + offset);
                if (left === newVal) {
                    return false;
                }
                $this.css({ left: newVal + "px" });
                break;
            case KeyEvent.DOM_VK_DOWN:
                newVal = Math.min(HEIGHT_MAIN + HEIGHT_BELOW, top + offset);
                if (top === newVal) {
                    return false;
                }
                $this.css({ top: newVal + "px" });
                break;
            }

            // update coords
//            stepEditor._stepParams = stepEditor.stepCanvas
//                .offsetsToCoordinates(stepEditor.P1)
//                .concat(stepEditor.stepCanvas.offsetsToCoordinates(stepEditor.P2));
            stepEditor._stepParams = stepEditor.stepCanvas.stepParams;

            stepEditor._commitTimingFunction();
            stepEditor._updateCanvas();
        }
*/

        return false;
    }


    /**
     * Constructor for StepEditor Object. This control may be used standalone
     * or within an InlineTimingFunctionEditor inline widget.
     *
     * @param {!jQuery} $parent  DOM node into which to append the root of the step editor UI
     * @param {!RegExpMatch} stepMatch  RegExp match object of initially selected step function
     * @param {!function(string)} callback  Called whenever selected step function changes
     */
    function StepEditor($parent, stepMatch, callback) {
        // Create the DOM structure, filling in localized strings via Mustache
        this.$element = $(Mustache.render(StepEditorTemplate, Strings));
        $parent.append(this.$element);
        
        this._callback = callback;
        this.dragElement = null;

        // current step function params
        this._stepParams = this._getStepParams(stepMatch);

//        this.P1 = this.$element.find(".P1")[0];
//        this.P2 = this.$element.find(".P2")[0];
        this.canvas = this.$element.find(".steps")[0];

//        this.P1.stepEditor = this.P2.stepEditor = this;
        this.canvas.stepEditor = this;

//        this.stepCanvas = new StepCanvas(this.canvas, null, [0, 0]);
        this.stepCanvas = new StepCanvas(this.canvas, null, [0]);
      
        // redraw canvas
        this._updateCanvas();

        $(this.canvas)
//            .on("click",     _canvasClick)
//            .on("mousemove", _canvasMouseMove);
            .on("keydown",   _canvasKeyDown);
//        $(this.P1)
//            .on("mousemove", _pointMouseMove)
//            .on("mousedown", _pointMouseDown)
//            .on("mouseup",   _pointMouseUp)
//            .on("keydown",   _pointKeyDown);
//        $(this.P2)
//            .on("mousemove", _pointMouseMove)
//            .on("mousedown", _pointMouseDown)
//            .on("mouseup",   _pointMouseUp)
//            .on("keydown",   _pointKeyDown);
    }

    /**
     * Destructor called by InlineTimingFunctionEditor.onClosed()
     */
    StepEditor.prototype.destroy = function () {

//        this.P1.stepEditor = this.P2.stepEditor = null;
        this.canvas.stepEditor = null;

        $(this.canvas)
//            .off("click",     _canvasClick)
//            .off("mousemove", _canvasMouseMove);
            .off("keydown",   _canvasKeyDown);
//        $(this.P1)
//            .off("mousemove", _pointMouseMove)
//            .off("mousedown", _pointMouseDown)
//            .off("mouseup",   _pointMouseUp)
//            .off("keydown",   _pointKeyDown);
//        $(this.P2)
//            .off("mousemove", _pointMouseMove)
//            .off("mousedown", _pointMouseDown)
//            .off("mouseup",   _pointMouseUp)
//            .off("keydown",   _pointKeyDown);
    };


    /** Returns the root DOM node of the StepEditor UI */
    StepEditor.prototype.getRootElement = function () {
        return this.$element;
    };

    /**
     * Default focus needs to go somewhere, so give it to canvas
     */
    StepEditor.prototype.focus = function () {
        this.canvas.focus();
        return true;
    };

    /**
     * Generates step function based on parameters, and updates the doc
     */
    StepEditor.prototype._commitTimingFunction = function () {
        var stepFuncVal = "steps(" +
            this._stepParams.count.toString() + ", " +
            this._stepParams.timing + ")";
        this._callback(stepFuncVal);
    };

    /**
     * Handle all matches returned from TimingFunctionUtils.stepMatch() and
     * return array of coords
     *
     * @param {RegExp.match} match Matches returned from stepMatch()
     * @return {{count: number, timing: string}}
     */
    StepEditor.prototype._getStepParams = function (match) {

        if (match[0].match(/^steps/)) {
            // steps()
            return {
                count:  parseInt(match[1], 10),
                timing: match[2] || "end"
            };
        } else {
            // handle special cases of steps functions
            switch (match[0]) {
            case "step-start":
                return { count: 1, timing: "start" };
            case "step-end":
                return { count: 1, timing: "end" };
            }
        }

        window.console.log("step timing function: _getStepParams() passed invalid RegExp match array");
        return { count: 1, timing: "end" };
    };

    /**
     * Get <canvas> element's bounding box
     *
     * @return {left: number, top: number, width: number, height: number}
     */
    StepEditor.prototype._getCanvasBoundingBox = function () {
        var $canvas = this.$element.find(".steps"),
            canvasOffset = $canvas.offset();

        return {
            left:    canvasOffset.left,
            top:     canvasOffset.top,
            width:   $canvas.width(),
            height:  $canvas.height()
        };
    };

    /**
     * Update <canvas> after a change
     */
    StepEditor.prototype._updateCanvas = function () {
        // collect data, build model
        if (this._stepParams) {
            this.stepCanvas.stepParams = window.stepParams = new StepParameters(this._stepParams);

//            var offsets = this.stepCanvas.getOffsets();
//
//            $(this.P1).css({
//                left: offsets[0].left,
//                top:  offsets[0].top
//            });
//            $(this.P2).css({
//                left: offsets[1].left,
//                top:  offsets[1].top
//            });

            this.stepCanvas.plot();
        }
    };
    
    /**
     * Handle external update
     *
     * @param {!RegExpMatch} stepMatch  RegExp match object of updated step function
     */
    StepEditor.prototype.handleExternalUpdate = function (stepMatch) {
        this._stepParams = this._getStepParams(stepMatch);
        this._updateCanvas();
    };

    
    exports.StepEditor = StepEditor;
});
