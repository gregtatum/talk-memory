(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
/** @license
 * crossroads <http://millermedeiros.github.com/crossroads.js/>
 * Author: Miller Medeiros | MIT License
 * v0.12.2 (2015/07/31 18:37)
 */

(function () {
var factory = function (signals) {

    var crossroads,
        _hasOptionalGroupBug,
        UNDEF;

    // Helpers -----------
    //====================

    // IE 7-8 capture optional groups as empty strings while other browsers
    // capture as `undefined`
    _hasOptionalGroupBug = (/t(.+)?/).exec('t')[1] === '';

    function arrayIndexOf(arr, val) {
        if (arr.indexOf) {
            return arr.indexOf(val);
        } else {
            //Array.indexOf doesn't work on IE 6-7
            var n = arr.length;
            while (n--) {
                if (arr[n] === val) {
                    return n;
                }
            }
            return -1;
        }
    }

    function arrayRemove(arr, item) {
        var i = arrayIndexOf(arr, item);
        if (i !== -1) {
            arr.splice(i, 1);
        }
    }

    function isKind(val, kind) {
        return '[object '+ kind +']' === Object.prototype.toString.call(val);
    }

    function isRegExp(val) {
        return isKind(val, 'RegExp');
    }

    function isArray(val) {
        return isKind(val, 'Array');
    }

    function isFunction(val) {
        return typeof val === 'function';
    }

    //borrowed from AMD-utils
    function typecastValue(val) {
        var r;
        if (val === null || val === 'null') {
            r = null;
        } else if (val === 'true') {
            r = true;
        } else if (val === 'false') {
            r = false;
        } else if (val === UNDEF || val === 'undefined') {
            r = UNDEF;
        } else if (val === '' || isNaN(val)) {
            //isNaN('') returns false
            r = val;
        } else {
            //parseFloat(null || '') returns NaN
            r = parseFloat(val);
        }
        return r;
    }

    function typecastArrayValues(values) {
        var n = values.length,
            result = [];
        while (n--) {
            result[n] = typecastValue(values[n]);
        }
        return result;
    }

    // borrowed from MOUT
    function decodeQueryString(queryStr, shouldTypecast) {
        var queryArr = (queryStr || '').replace('?', '').split('&'),
            reg = /([^=]+)=(.+)/,
            i = -1,
            obj = {},
            equalIndex, cur, pValue, pName;

        while ((cur = queryArr[++i])) {
            equalIndex = cur.indexOf('=');
            pName = cur.substring(0, equalIndex);
            pValue = decodeURIComponent(cur.substring(equalIndex + 1));
            if (shouldTypecast !== false) {
                pValue = typecastValue(pValue);
            }
            if (pName in obj){
                if(isArray(obj[pName])){
                    obj[pName].push(pValue);
                } else {
                    obj[pName] = [obj[pName], pValue];
                }
            } else {
                obj[pName] = pValue;
           }
        }
        return obj;
    }


    // Crossroads --------
    //====================

    /**
     * @constructor
     */
    function Crossroads() {
        this.bypassed = new signals.Signal();
        this.routed = new signals.Signal();
        this._routes = [];
        this._prevRoutes = [];
        this._piped = [];
        this.resetState();
    }

    Crossroads.prototype = {

        greedy : false,

        greedyEnabled : true,

        ignoreCase : true,

        ignoreState : false,

        shouldTypecast : false,

        normalizeFn : null,

        resetState : function(){
            this._prevRoutes.length = 0;
            this._prevMatchedRequest = null;
            this._prevBypassedRequest = null;
        },

        create : function () {
            return new Crossroads();
        },

        addRoute : function (pattern, callback, priority) {
            var route = new Route(pattern, callback, priority, this);
            this._sortedInsert(route);
            return route;
        },

        removeRoute : function (route) {
            arrayRemove(this._routes, route);
            route._destroy();
        },

        removeAllRoutes : function () {
            var n = this.getNumRoutes();
            while (n--) {
                this._routes[n]._destroy();
            }
            this._routes.length = 0;
        },

        parse : function (request, defaultArgs) {
            request = request || '';
            defaultArgs = defaultArgs || [];

            // should only care about different requests if ignoreState isn't true
            if ( !this.ignoreState &&
                (request === this._prevMatchedRequest ||
                 request === this._prevBypassedRequest) ) {
                return;
            }

            var routes = this._getMatchedRoutes(request),
                i = 0,
                n = routes.length,
                cur;

            if (n) {
                this._prevMatchedRequest = request;

                this._notifyPrevRoutes(routes, request);
                this._prevRoutes = routes;
                //should be incremental loop, execute routes in order
                while (i < n) {
                    cur = routes[i];
                    cur.route.matched.dispatch.apply(cur.route.matched, defaultArgs.concat(cur.params));
                    cur.isFirst = !i;
                    this.routed.dispatch.apply(this.routed, defaultArgs.concat([request, cur]));
                    i += 1;
                }
            } else {
                this._prevBypassedRequest = request;
                this.bypassed.dispatch.apply(this.bypassed, defaultArgs.concat([request]));
            }

            this._pipeParse(request, defaultArgs);
        },

        _notifyPrevRoutes : function(matchedRoutes, request) {
            var i = 0, prev;
            while (prev = this._prevRoutes[i++]) {
                //check if switched exist since route may be disposed
                if(prev.route.switched && this._didSwitch(prev.route, matchedRoutes)) {
                    prev.route.switched.dispatch(request);
                }
            }
        },

        _didSwitch : function (route, matchedRoutes){
            var matched,
                i = 0;
            while (matched = matchedRoutes[i++]) {
                // only dispatch switched if it is going to a different route
                if (matched.route === route) {
                    return false;
                }
            }
            return true;
        },

        _pipeParse : function(request, defaultArgs) {
            var i = 0, route;
            while (route = this._piped[i++]) {
                route.parse(request, defaultArgs);
            }
        },

        getNumRoutes : function () {
            return this._routes.length;
        },

        _sortedInsert : function (route) {
            //simplified insertion sort
            var routes = this._routes,
                n = routes.length;
            do { --n; } while (routes[n] && route._priority <= routes[n]._priority);
            routes.splice(n+1, 0, route);
        },

        _getMatchedRoutes : function (request) {
            var res = [],
                routes = this._routes,
                n = routes.length,
                route;
            //should be decrement loop since higher priorities are added at the end of array
            while (route = routes[--n]) {
                if ((!res.length || this.greedy || route.greedy) && route.match(request)) {
                    res.push({
                        route : route,
                        params : route._getParamsArray(request)
                    });
                }
                if (!this.greedyEnabled && res.length) {
                    break;
                }
            }
            return res;
        },

        pipe : function (otherRouter) {
            this._piped.push(otherRouter);
        },

        unpipe : function (otherRouter) {
            arrayRemove(this._piped, otherRouter);
        },

        toString : function () {
            return '[crossroads numRoutes:'+ this.getNumRoutes() +']';
        }
    };

    //"static" instance
    crossroads = new Crossroads();
    crossroads.VERSION = '0.12.2';

    crossroads.NORM_AS_ARRAY = function (req, vals) {
        return [vals.vals_];
    };

    crossroads.NORM_AS_OBJECT = function (req, vals) {
        return [vals];
    };


    // Route --------------
    //=====================

    /**
     * @constructor
     */
    function Route(pattern, callback, priority, router) {
        var isRegexPattern = isRegExp(pattern),
            patternLexer = router.patternLexer;
        this._router = router;
        this._pattern = pattern;
        this._paramsIds = isRegexPattern? null : patternLexer.getParamIds(pattern);
        this._optionalParamsIds = isRegexPattern? null : patternLexer.getOptionalParamsIds(pattern);
        this._matchRegexp = isRegexPattern? pattern : patternLexer.compilePattern(pattern, router.ignoreCase);
        this.matched = new signals.Signal();
        this.switched = new signals.Signal();
        if (callback) {
            this.matched.add(callback);
        }
        this._priority = priority || 0;
    }

    Route.prototype = {

        greedy : false,

        rules : void(0),

        match : function (request) {
            request = request || '';
            return this._matchRegexp.test(request) && this._validateParams(request); //validate params even if regexp because of `request_` rule.
        },

        _validateParams : function (request) {
            var rules = this.rules,
                values = this._getParamsObject(request),
                key;
            for (key in rules) {
                // normalize_ isn't a validation rule... (#39)
                if(key !== 'normalize_' && rules.hasOwnProperty(key) && ! this._isValidParam(request, key, values)){
                    return false;
                }
            }
            return true;
        },

        _isValidParam : function (request, prop, values) {
            var validationRule = this.rules[prop],
                val = values[prop],
                isValid = false,
                isQuery = (prop.indexOf('?') === 0);

            if (val == null && this._optionalParamsIds && arrayIndexOf(this._optionalParamsIds, prop) !== -1) {
                isValid = true;
            }
            else if (isRegExp(validationRule)) {
                if (isQuery) {
                    val = values[prop +'_']; //use raw string
                }
                isValid = validationRule.test(val);
            }
            else if (isArray(validationRule)) {
                if (isQuery) {
                    val = values[prop +'_']; //use raw string
                }
                isValid = this._isValidArrayRule(validationRule, val);
            }
            else if (isFunction(validationRule)) {
                isValid = validationRule(val, request, values);
            }

            return isValid; //fail silently if validationRule is from an unsupported type
        },

        _isValidArrayRule : function (arr, val) {
            if (! this._router.ignoreCase) {
                return arrayIndexOf(arr, val) !== -1;
            }

            if (typeof val === 'string') {
                val = val.toLowerCase();
            }

            var n = arr.length,
                item,
                compareVal;

            while (n--) {
                item = arr[n];
                compareVal = (typeof item === 'string')? item.toLowerCase() : item;
                if (compareVal === val) {
                    return true;
                }
            }
            return false;
        },

        _getParamsObject : function (request) {
            var shouldTypecast = this._router.shouldTypecast,
                values = this._router.patternLexer.getParamValues(request, this._matchRegexp, shouldTypecast),
                o = {},
                n = values.length,
                param, val;
            while (n--) {
                val = values[n];
                if (this._paramsIds) {
                    param = this._paramsIds[n];
                    if (param.indexOf('?') === 0 && val) {
                        //make a copy of the original string so array and
                        //RegExp validation can be applied properly
                        o[param +'_'] = val;
                        //update vals_ array as well since it will be used
                        //during dispatch
                        val = decodeQueryString(val, shouldTypecast);
                        values[n] = val;
                    }
                    // IE will capture optional groups as empty strings while other
                    // browsers will capture `undefined` so normalize behavior.
                    // see: #gh-58, #gh-59, #gh-60
                    if ( _hasOptionalGroupBug && val === '' && arrayIndexOf(this._optionalParamsIds, param) !== -1 ) {
                        val = void(0);
                        values[n] = val;
                    }
                    o[param] = val;
                }
                //alias to paths and for RegExp pattern
                o[n] = val;
            }
            o.request_ = shouldTypecast? typecastValue(request) : request;
            o.vals_ = values;
            return o;
        },

        _getParamsArray : function (request) {
            var norm = this.rules? this.rules.normalize_ : null,
                params;
            norm = norm || this._router.normalizeFn; // default normalize
            if (norm && isFunction(norm)) {
                params = norm(request, this._getParamsObject(request));
            } else {
                params = this._getParamsObject(request).vals_;
            }
            return params;
        },

        interpolate : function(replacements) {
            var str = this._router.patternLexer.interpolate(this._pattern, replacements);
            if (! this._validateParams(str) ) {
                throw new Error('Generated string doesn\'t validate against `Route.rules`.');
            }
            return str;
        },

        dispose : function () {
            this._router.removeRoute(this);
        },

        _destroy : function () {
            this.matched.dispose();
            this.switched.dispose();
            this.matched = this.switched = this._pattern = this._matchRegexp = null;
        },

        toString : function () {
            return '[Route pattern:"'+ this._pattern +'", numListeners:'+ this.matched.getNumListeners() +']';
        }

    };



    // Pattern Lexer ------
    //=====================

    Crossroads.prototype.patternLexer = (function () {

        var
            //match chars that should be escaped on string regexp
            ESCAPE_CHARS_REGEXP = /[\\.+*?\^$\[\](){}\/'#]/g,

            //trailing slashes (begin/end of string)
            LOOSE_SLASHES_REGEXP = /^\/|\/$/g,
            LEGACY_SLASHES_REGEXP = /\/$/g,

            //params - everything between `{ }` or `: :`
            PARAMS_REGEXP = /(?:\{|:)([^}:]+)(?:\}|:)/g,

            //used to save params during compile (avoid escaping things that
            //shouldn't be escaped).
            TOKENS = {
                'OS' : {
                    //optional slashes
                    //slash between `::` or `}:` or `\w:` or `:{?` or `}{?` or `\w{?`
                    rgx : /([:}]|\w(?=\/))\/?(:|(?:\{\?))/g,
                    save : '$1{{id}}$2',
                    res : '\\/?'
                },
                'RS' : {
                    //required slashes
                    //used to insert slash between `:{` and `}{`
                    rgx : /([:}])\/?(\{)/g,
                    save : '$1{{id}}$2',
                    res : '\\/'
                },
                'RQ' : {
                    //required query string - everything in between `{? }`
                    rgx : /\{\?([^}]+)\}/g,
                    //everything from `?` till `#` or end of string
                    res : '\\?([^#]+)'
                },
                'OQ' : {
                    //optional query string - everything in between `:? :`
                    rgx : /:\?([^:]+):/g,
                    //everything from `?` till `#` or end of string
                    res : '(?:\\?([^#]*))?'
                },
                'OR' : {
                    //optional rest - everything in between `: *:`
                    rgx : /:([^:]+)\*:/g,
                    res : '(.*)?' // optional group to avoid passing empty string as captured
                },
                'RR' : {
                    //rest param - everything in between `{ *}`
                    rgx : /\{([^}]+)\*\}/g,
                    res : '(.+)'
                },
                // required/optional params should come after rest segments
                'RP' : {
                    //required params - everything between `{ }`
                    rgx : /\{([^}]+)\}/g,
                    res : '([^\\/?]+)'
                },
                'OP' : {
                    //optional params - everything between `: :`
                    rgx : /:([^:]+):/g,
                    res : '([^\\/?]+)?\/?'
                }
            },

            LOOSE_SLASH = 1,
            STRICT_SLASH = 2,
            LEGACY_SLASH = 3,

            _slashMode = LOOSE_SLASH;


        function precompileTokens(){
            var key, cur;
            for (key in TOKENS) {
                if (TOKENS.hasOwnProperty(key)) {
                    cur = TOKENS[key];
                    cur.id = '__CR_'+ key +'__';
                    cur.save = ('save' in cur)? cur.save.replace('{{id}}', cur.id) : cur.id;
                    cur.rRestore = new RegExp(cur.id, 'g');
                }
            }
        }
        precompileTokens();


        function captureVals(regex, pattern) {
            var vals = [], match;
            // very important to reset lastIndex since RegExp can have "g" flag
            // and multiple runs might affect the result, specially if matching
            // same string multiple times on IE 7-8
            regex.lastIndex = 0;
            while (match = regex.exec(pattern)) {
                vals.push(match[1]);
            }
            return vals;
        }

        function getParamIds(pattern) {
            return captureVals(PARAMS_REGEXP, pattern);
        }

        function getOptionalParamsIds(pattern) {
            return captureVals(TOKENS.OP.rgx, pattern);
        }

        function compilePattern(pattern, ignoreCase) {
            pattern = pattern || '';

            if(pattern){
                if (_slashMode === LOOSE_SLASH) {
                    pattern = pattern.replace(LOOSE_SLASHES_REGEXP, '');
                }
                else if (_slashMode === LEGACY_SLASH) {
                    pattern = pattern.replace(LEGACY_SLASHES_REGEXP, '');
                }

                //save tokens
                pattern = replaceTokens(pattern, 'rgx', 'save');
                //regexp escape
                pattern = pattern.replace(ESCAPE_CHARS_REGEXP, '\\$&');
                //restore tokens
                pattern = replaceTokens(pattern, 'rRestore', 'res');

                if (_slashMode === LOOSE_SLASH) {
                    pattern = '\\/?'+ pattern;
                }
            }

            if (_slashMode !== STRICT_SLASH) {
                //single slash is treated as empty and end slash is optional
                pattern += '\\/?';
            }
            return new RegExp('^'+ pattern + '$', ignoreCase? 'i' : '');
        }

        function replaceTokens(pattern, regexpName, replaceName) {
            var cur, key;
            for (key in TOKENS) {
                if (TOKENS.hasOwnProperty(key)) {
                    cur = TOKENS[key];
                    pattern = pattern.replace(cur[regexpName], cur[replaceName]);
                }
            }
            return pattern;
        }

        function getParamValues(request, regexp, shouldTypecast) {
            var vals = regexp.exec(request);
            if (vals) {
                vals.shift();
                if (shouldTypecast) {
                    vals = typecastArrayValues(vals);
                }
            }
            return vals;
        }

        function interpolate(pattern, replacements) {
            // default to an empty object because pattern might have just
            // optional arguments
            replacements = replacements || {};
            if (typeof pattern !== 'string') {
                throw new Error('Route pattern should be a string.');
            }

            var replaceFn = function(match, prop){
                    var val;
                    prop = (prop.substr(0, 1) === '?')? prop.substr(1) : prop;
                    if (replacements[prop] != null) {
                        if (typeof replacements[prop] === 'object') {
                            var queryParts = [], rep;
                            for(var key in replacements[prop]) {
                                rep = replacements[prop][key];
                                if (isArray(rep)) {
                                    for (var k in rep) {
                                        if ( key.slice(-2) == '[]' ) {
                                            queryParts.push(encodeURI(key.slice(0, -2)) + '[]=' + encodeURI(rep[k]));
                                        } else {
                                            queryParts.push(encodeURI(key + '=' + rep[k]));
                                        }
                                    }
                                }
                                else {
                                    queryParts.push(encodeURI(key + '=' + rep));
                                }
                            }
                            val = '?' + queryParts.join('&');
                        } else {
                            // make sure value is a string see #gh-54
                            val = String(replacements[prop]);
                        }

                        if (match.indexOf('*') === -1 && val.indexOf('/') !== -1) {
                            throw new Error('Invalid value "'+ val +'" for segment "'+ match +'".');
                        }
                    }
                    else if (match.indexOf('{') !== -1) {
                        throw new Error('The segment '+ match +' is required.');
                    }
                    else {
                        val = '';
                    }
                    return val;
                };

            if (! TOKENS.OS.trail) {
                TOKENS.OS.trail = new RegExp('(?:'+ TOKENS.OS.id +')+$');
            }

            return pattern
                        .replace(TOKENS.OS.rgx, TOKENS.OS.save)
                        .replace(PARAMS_REGEXP, replaceFn)
                        .replace(TOKENS.OS.trail, '') // remove trailing
                        .replace(TOKENS.OS.rRestore, '/'); // add slash between segments
        }

        //API
        return {
            strict : function(){
                _slashMode = STRICT_SLASH;
            },
            loose : function(){
                _slashMode = LOOSE_SLASH;
            },
            legacy : function(){
                _slashMode = LEGACY_SLASH;
            },
            getParamIds : getParamIds,
            getOptionalParamsIds : getOptionalParamsIds,
            getParamValues : getParamValues,
            compilePattern : compilePattern,
            interpolate : interpolate
        };

    }());


    return crossroads;
};

if (typeof define === 'function' && define.amd) {
    define(['signals'], factory);
} else if (typeof module !== 'undefined' && module.exports) { //Node
    module.exports = factory(require('signals'));
} else {
    /*jshint sub:true */
    window['crossroads'] = factory(window['signals']);
}

}());


},{"signals":3}],2:[function(require,module,exports){
/*!!
 * Hasher <http://github.com/millermedeiros/hasher>
 * @author Miller Medeiros
 * @version 1.2.0 (2013/11/11 03:18 PM)
 * Released under the MIT License
 */

;(function () {
var factory = function(signals){

/*jshint white:false*/
/*global signals:false, window:false*/

/**
 * Hasher
 * @namespace History Manager for rich-media applications.
 * @name hasher
 */
var hasher = (function(window){

    //--------------------------------------------------------------------------------------
    // Private Vars
    //--------------------------------------------------------------------------------------

    var

        // frequency that it will check hash value on IE 6-7 since it doesn't
        // support the hashchange event
        POOL_INTERVAL = 25,

        // local storage for brevity and better compression --------------------------------

        document = window.document,
        history = window.history,
        Signal = signals.Signal,

        // local vars ----------------------------------------------------------------------

        hasher,
        _hash,
        _checkInterval,
        _isActive,
        _frame, //iframe used for legacy IE (6-7)
        _checkHistory,
        _hashValRegexp = /#(.*)$/,
        _baseUrlRegexp = /(\?.*)|(\#.*)/,
        _hashRegexp = /^\#/,

        // sniffing/feature detection -------------------------------------------------------

        //hack based on this: http://webreflection.blogspot.com/2009/01/32-bytes-to-know-if-your-browser-is-ie.html
        _isIE = (!+"\v1"),
        // hashchange is supported by FF3.6+, IE8+, Chrome 5+, Safari 5+ but
        // feature detection fails on IE compatibility mode, so we need to
        // check documentMode
        _isHashChangeSupported = ('onhashchange' in window) && document.documentMode !== 7,
        //check if is IE6-7 since hash change is only supported on IE8+ and
        //changing hash value on IE6-7 doesn't generate history record.
        _isLegacyIE = _isIE && !_isHashChangeSupported,
        _isLocal = (location.protocol === 'file:');


    //--------------------------------------------------------------------------------------
    // Private Methods
    //--------------------------------------------------------------------------------------

    function _escapeRegExp(str){
        return String(str || '').replace(/\W/g, "\\$&");
    }

    function _trimHash(hash){
        if (!hash) return '';
        var regexp = new RegExp('^' + _escapeRegExp(hasher.prependHash) + '|' + _escapeRegExp(hasher.appendHash) + '$', 'g');
        return hash.replace(regexp, '');
    }

    function _getWindowHash(){
        //parsed full URL instead of getting window.location.hash because Firefox decode hash value (and all the other browsers don't)
        //also because of IE8 bug with hash query in local file [issue #6]
        var result = _hashValRegexp.exec( hasher.getURL() );
        var path = (result && result[1]) || '';
        try {
          return hasher.raw? path : decodeURIComponent(path);
        } catch (e) {
          // in case user did not set `hasher.raw` and decodeURIComponent
          // throws an error (see #57)
          return path;
        }
    }

    function _getFrameHash(){
        return (_frame)? _frame.contentWindow.frameHash : null;
    }

    function _createFrame(){
        _frame = document.createElement('iframe');
        _frame.src = 'about:blank';
        _frame.style.display = 'none';
        document.body.appendChild(_frame);
    }

    function _updateFrame(){
        if(_frame && _hash !== _getFrameHash()){
            var frameDoc = _frame.contentWindow.document;
            frameDoc.open();
            //update iframe content to force new history record.
            //based on Really Simple History, SWFAddress and YUI.history.
            frameDoc.write('<html><head><title>' + document.title + '</title><script type="text/javascript">var frameHash="' + _hash + '";</script></head><body>&nbsp;</body></html>');
            frameDoc.close();
        }
    }

    function _registerChange(newHash, isReplace){
        if(_hash !== newHash){
            var oldHash = _hash;
            _hash = newHash; //should come before event dispatch to make sure user can get proper value inside event handler
            if(_isLegacyIE){
                if(!isReplace){
                    _updateFrame();
                } else {
                    _frame.contentWindow.frameHash = newHash;
                }
            }
            hasher.changed.dispatch(_trimHash(newHash), _trimHash(oldHash));
        }
    }

    if (_isLegacyIE) {
        /**
         * @private
         */
        _checkHistory = function(){
            var windowHash = _getWindowHash(),
                frameHash = _getFrameHash();
            if(frameHash !== _hash && frameHash !== windowHash){
                //detect changes made pressing browser history buttons.
                //Workaround since history.back() and history.forward() doesn't
                //update hash value on IE6/7 but updates content of the iframe.
                //needs to trim hash since value stored already have
                //prependHash + appendHash for fast check.
                hasher.setHash(_trimHash(frameHash));
            } else if (windowHash !== _hash){
                //detect if hash changed (manually or using setHash)
                _registerChange(windowHash);
            }
        };
    } else {
        /**
         * @private
         */
        _checkHistory = function(){
            var windowHash = _getWindowHash();
            if(windowHash !== _hash){
                _registerChange(windowHash);
            }
        };
    }

    function _addListener(elm, eType, fn){
        if(elm.addEventListener){
            elm.addEventListener(eType, fn, false);
        } else if (elm.attachEvent){
            elm.attachEvent('on' + eType, fn);
        }
    }

    function _removeListener(elm, eType, fn){
        if(elm.removeEventListener){
            elm.removeEventListener(eType, fn, false);
        } else if (elm.detachEvent){
            elm.detachEvent('on' + eType, fn);
        }
    }

    function _makePath(paths){
        paths = Array.prototype.slice.call(arguments);

        var path = paths.join(hasher.separator);
        path = path? hasher.prependHash + path.replace(_hashRegexp, '') + hasher.appendHash : path;
        return path;
    }

    function _encodePath(path){
        //used encodeURI instead of encodeURIComponent to preserve '?', '/',
        //'#'. Fixes Safari bug [issue #8]
        path = encodeURI(path);
        if(_isIE && _isLocal){
            //fix IE8 local file bug [issue #6]
            path = path.replace(/\?/, '%3F');
        }
        return path;
    }

    //--------------------------------------------------------------------------------------
    // Public (API)
    //--------------------------------------------------------------------------------------

    hasher = /** @lends hasher */ {

        /**
         * hasher Version Number
         * @type string
         * @constant
         */
        VERSION : '1.2.0',

        /**
         * Boolean deciding if hasher encodes/decodes the hash or not.
         * <ul>
         * <li>default value: false;</li>
         * </ul>
         * @type boolean
         */
        raw : false,

        /**
         * String that should always be added to the end of Hash value.
         * <ul>
         * <li>default value: '';</li>
         * <li>will be automatically removed from `hasher.getHash()`</li>
         * <li>avoid conflicts with elements that contain ID equal to hash value;</li>
         * </ul>
         * @type string
         */
        appendHash : '',

        /**
         * String that should always be added to the beginning of Hash value.
         * <ul>
         * <li>default value: '/';</li>
         * <li>will be automatically removed from `hasher.getHash()`</li>
         * <li>avoid conflicts with elements that contain ID equal to hash value;</li>
         * </ul>
         * @type string
         */
        prependHash : '/',

        /**
         * String used to split hash paths; used by `hasher.getHashAsArray()` to split paths.
         * <ul>
         * <li>default value: '/';</li>
         * </ul>
         * @type string
         */
        separator : '/',

        /**
         * Signal dispatched when hash value changes.
         * - pass current hash as 1st parameter to listeners and previous hash value as 2nd parameter.
         * @type signals.Signal
         */
        changed : new Signal(),

        /**
         * Signal dispatched when hasher is stopped.
         * -  pass current hash as first parameter to listeners
         * @type signals.Signal
         */
        stopped : new Signal(),

        /**
         * Signal dispatched when hasher is initialized.
         * - pass current hash as first parameter to listeners.
         * @type signals.Signal
         */
        initialized : new Signal(),

        /**
         * Start listening/dispatching changes in the hash/history.
         * <ul>
         *   <li>hasher won't dispatch CHANGE events by manually typing a new value or pressing the back/forward buttons before calling this method.</li>
         * </ul>
         */
        init : function(){
            if(_isActive) return;

            _hash = _getWindowHash();

            //thought about branching/overloading hasher.init() to avoid checking multiple times but
            //don't think worth doing it since it probably won't be called multiple times.
            if(_isHashChangeSupported){
                _addListener(window, 'hashchange', _checkHistory);
            }else {
                if(_isLegacyIE){
                    if(! _frame){
                        _createFrame();
                    }
                    _updateFrame();
                }
                _checkInterval = setInterval(_checkHistory, POOL_INTERVAL);
            }

            _isActive = true;
            hasher.initialized.dispatch(_trimHash(_hash));
        },

        /**
         * Stop listening/dispatching changes in the hash/history.
         * <ul>
         *   <li>hasher won't dispatch CHANGE events by manually typing a new value or pressing the back/forward buttons after calling this method, unless you call hasher.init() again.</li>
         *   <li>hasher will still dispatch changes made programatically by calling hasher.setHash();</li>
         * </ul>
         */
        stop : function(){
            if(! _isActive) return;

            if(_isHashChangeSupported){
                _removeListener(window, 'hashchange', _checkHistory);
            }else{
                clearInterval(_checkInterval);
                _checkInterval = null;
            }

            _isActive = false;
            hasher.stopped.dispatch(_trimHash(_hash));
        },

        /**
         * @return {boolean}    If hasher is listening to changes on the browser history and/or hash value.
         */
        isActive : function(){
            return _isActive;
        },

        /**
         * @return {string} Full URL.
         */
        getURL : function(){
            return window.location.href;
        },

        /**
         * @return {string} Retrieve URL without query string and hash.
         */
        getBaseURL : function(){
            return hasher.getURL().replace(_baseUrlRegexp, ''); //removes everything after '?' and/or '#'
        },

        /**
         * Set Hash value, generating a new history record.
         * @param {...string} path    Hash value without '#'. Hasher will join
         * path segments using `hasher.separator` and prepend/append hash value
         * with `hasher.appendHash` and `hasher.prependHash`
         * @example hasher.setHash('lorem', 'ipsum', 'dolor') -> '#/lorem/ipsum/dolor'
         */
        setHash : function(path){
            path = _makePath.apply(null, arguments);
            if(path !== _hash){
                // we should store raw value
                _registerChange(path);
                if (path === _hash) {
                    // we check if path is still === _hash to avoid error in
                    // case of multiple consecutive redirects [issue #39]
                    if (! hasher.raw) {
                        path = _encodePath(path);
                    }
                    window.location.hash = '#' + path;
                }
            }
        },

        /**
         * Set Hash value without keeping previous hash on the history record.
         * Similar to calling `window.location.replace("#/hash")` but will also work on IE6-7.
         * @param {...string} path    Hash value without '#'. Hasher will join
         * path segments using `hasher.separator` and prepend/append hash value
         * with `hasher.appendHash` and `hasher.prependHash`
         * @example hasher.replaceHash('lorem', 'ipsum', 'dolor') -> '#/lorem/ipsum/dolor'
         */
        replaceHash : function(path){
            path = _makePath.apply(null, arguments);
            if(path !== _hash){
                // we should store raw value
                _registerChange(path, true);
                if (path === _hash) {
                    // we check if path is still === _hash to avoid error in
                    // case of multiple consecutive redirects [issue #39]
                    if (! hasher.raw) {
                        path = _encodePath(path);
                    }
                    window.location.replace('#' + path);
                }
            }
        },

        /**
         * @return {string} Hash value without '#', `hasher.appendHash` and `hasher.prependHash`.
         */
        getHash : function(){
            //didn't used actual value of the `window.location.hash` to avoid breaking the application in case `window.location.hash` isn't available and also because value should always be synched.
            return _trimHash(_hash);
        },

        /**
         * @return {Array.<string>} Hash value split into an Array.
         */
        getHashAsArray : function(){
            return hasher.getHash().split(hasher.separator);
        },

        /**
         * Removes all event listeners, stops hasher and destroy hasher object.
         * - IMPORTANT: hasher won't work after calling this method, hasher Object will be deleted.
         */
        dispose : function(){
            hasher.stop();
            hasher.initialized.dispose();
            hasher.stopped.dispose();
            hasher.changed.dispose();
            _frame = hasher = window.hasher = null;
        },

        /**
         * @return {string} A string representation of the object.
         */
        toString : function(){
            return '[hasher version="'+ hasher.VERSION +'" hash="'+ hasher.getHash() +'"]';
        }

    };

    hasher.initialized.memorize = true; //see #33

    return hasher;

}(window));


    return hasher;
};

if (typeof define === 'function' && define.amd) {
    define(['signals'], factory);
} else if (typeof exports === 'object') {
    module.exports = factory(require('signals'));
} else {
    /*jshint sub:true */
    window['hasher'] = factory(window['signals']);
}

}());

},{"signals":3}],3:[function(require,module,exports){
/*jslint onevar:true, undef:true, newcap:true, regexp:true, bitwise:true, maxerr:50, indent:4, white:false, nomen:false, plusplus:false */
/*global define:false, require:false, exports:false, module:false, signals:false */

/** @license
 * JS Signals <http://millermedeiros.github.com/js-signals/>
 * Released under the MIT license
 * Author: Miller Medeiros
 * Version: 1.0.0 - Build: 268 (2012/11/29 05:48 PM)
 */

(function(global){

    // SignalBinding -------------------------------------------------
    //================================================================

    /**
     * Object that represents a binding between a Signal and a listener function.
     * <br />- <strong>This is an internal constructor and shouldn't be called by regular users.</strong>
     * <br />- inspired by Joa Ebert AS3 SignalBinding and Robert Penner's Slot classes.
     * @author Miller Medeiros
     * @constructor
     * @internal
     * @name SignalBinding
     * @param {Signal} signal Reference to Signal object that listener is currently bound to.
     * @param {Function} listener Handler function bound to the signal.
     * @param {boolean} isOnce If binding should be executed just once.
     * @param {Object} [listenerContext] Context on which listener will be executed (object that should represent the `this` variable inside listener function).
     * @param {Number} [priority] The priority level of the event listener. (default = 0).
     */
    function SignalBinding(signal, listener, isOnce, listenerContext, priority) {

        /**
         * Handler function bound to the signal.
         * @type Function
         * @private
         */
        this._listener = listener;

        /**
         * If binding should be executed just once.
         * @type boolean
         * @private
         */
        this._isOnce = isOnce;

        /**
         * Context on which listener will be executed (object that should represent the `this` variable inside listener function).
         * @memberOf SignalBinding.prototype
         * @name context
         * @type Object|undefined|null
         */
        this.context = listenerContext;

        /**
         * Reference to Signal object that listener is currently bound to.
         * @type Signal
         * @private
         */
        this._signal = signal;

        /**
         * Listener priority
         * @type Number
         * @private
         */
        this._priority = priority || 0;
    }

    SignalBinding.prototype = {

        /**
         * If binding is active and should be executed.
         * @type boolean
         */
        active : true,

        /**
         * Default parameters passed to listener during `Signal.dispatch` and `SignalBinding.execute`. (curried parameters)
         * @type Array|null
         */
        params : null,

        /**
         * Call listener passing arbitrary parameters.
         * <p>If binding was added using `Signal.addOnce()` it will be automatically removed from signal dispatch queue, this method is used internally for the signal dispatch.</p>
         * @param {Array} [paramsArr] Array of parameters that should be passed to the listener
         * @return {*} Value returned by the listener.
         */
        execute : function (paramsArr) {
            var handlerReturn, params;
            if (this.active && !!this._listener) {
                params = this.params? this.params.concat(paramsArr) : paramsArr;
                handlerReturn = this._listener.apply(this.context, params);
                if (this._isOnce) {
                    this.detach();
                }
            }
            return handlerReturn;
        },

        /**
         * Detach binding from signal.
         * - alias to: mySignal.remove(myBinding.getListener());
         * @return {Function|null} Handler function bound to the signal or `null` if binding was previously detached.
         */
        detach : function () {
            return this.isBound()? this._signal.remove(this._listener, this.context) : null;
        },

        /**
         * @return {Boolean} `true` if binding is still bound to the signal and have a listener.
         */
        isBound : function () {
            return (!!this._signal && !!this._listener);
        },

        /**
         * @return {boolean} If SignalBinding will only be executed once.
         */
        isOnce : function () {
            return this._isOnce;
        },

        /**
         * @return {Function} Handler function bound to the signal.
         */
        getListener : function () {
            return this._listener;
        },

        /**
         * @return {Signal} Signal that listener is currently bound to.
         */
        getSignal : function () {
            return this._signal;
        },

        /**
         * Delete instance properties
         * @private
         */
        _destroy : function () {
            delete this._signal;
            delete this._listener;
            delete this.context;
        },

        /**
         * @return {string} String representation of the object.
         */
        toString : function () {
            return '[SignalBinding isOnce:' + this._isOnce +', isBound:'+ this.isBound() +', active:' + this.active + ']';
        }

    };


/*global SignalBinding:false*/

    // Signal --------------------------------------------------------
    //================================================================

    function validateListener(listener, fnName) {
        if (typeof listener !== 'function') {
            throw new Error( 'listener is a required param of {fn}() and should be a Function.'.replace('{fn}', fnName) );
        }
    }

    /**
     * Custom event broadcaster
     * <br />- inspired by Robert Penner's AS3 Signals.
     * @name Signal
     * @author Miller Medeiros
     * @constructor
     */
    function Signal() {
        /**
         * @type Array.<SignalBinding>
         * @private
         */
        this._bindings = [];
        this._prevParams = null;

        // enforce dispatch to aways work on same context (#47)
        var self = this;
        this.dispatch = function(){
            Signal.prototype.dispatch.apply(self, arguments);
        };
    }

    Signal.prototype = {

        /**
         * Signals Version Number
         * @type String
         * @const
         */
        VERSION : '1.0.0',

        /**
         * If Signal should keep record of previously dispatched parameters and
         * automatically execute listener during `add()`/`addOnce()` if Signal was
         * already dispatched before.
         * @type boolean
         */
        memorize : false,

        /**
         * @type boolean
         * @private
         */
        _shouldPropagate : true,

        /**
         * If Signal is active and should broadcast events.
         * <p><strong>IMPORTANT:</strong> Setting this property during a dispatch will only affect the next dispatch, if you want to stop the propagation of a signal use `halt()` instead.</p>
         * @type boolean
         */
        active : true,

        /**
         * @param {Function} listener
         * @param {boolean} isOnce
         * @param {Object} [listenerContext]
         * @param {Number} [priority]
         * @return {SignalBinding}
         * @private
         */
        _registerListener : function (listener, isOnce, listenerContext, priority) {

            var prevIndex = this._indexOfListener(listener, listenerContext),
                binding;

            if (prevIndex !== -1) {
                binding = this._bindings[prevIndex];
                if (binding.isOnce() !== isOnce) {
                    throw new Error('You cannot add'+ (isOnce? '' : 'Once') +'() then add'+ (!isOnce? '' : 'Once') +'() the same listener without removing the relationship first.');
                }
            } else {
                binding = new SignalBinding(this, listener, isOnce, listenerContext, priority);
                this._addBinding(binding);
            }

            if(this.memorize && this._prevParams){
                binding.execute(this._prevParams);
            }

            return binding;
        },

        /**
         * @param {SignalBinding} binding
         * @private
         */
        _addBinding : function (binding) {
            //simplified insertion sort
            var n = this._bindings.length;
            do { --n; } while (this._bindings[n] && binding._priority <= this._bindings[n]._priority);
            this._bindings.splice(n + 1, 0, binding);
        },

        /**
         * @param {Function} listener
         * @return {number}
         * @private
         */
        _indexOfListener : function (listener, context) {
            var n = this._bindings.length,
                cur;
            while (n--) {
                cur = this._bindings[n];
                if (cur._listener === listener && cur.context === context) {
                    return n;
                }
            }
            return -1;
        },

        /**
         * Check if listener was attached to Signal.
         * @param {Function} listener
         * @param {Object} [context]
         * @return {boolean} if Signal has the specified listener.
         */
        has : function (listener, context) {
            return this._indexOfListener(listener, context) !== -1;
        },

        /**
         * Add a listener to the signal.
         * @param {Function} listener Signal handler function.
         * @param {Object} [listenerContext] Context on which listener will be executed (object that should represent the `this` variable inside listener function).
         * @param {Number} [priority] The priority level of the event listener. Listeners with higher priority will be executed before listeners with lower priority. Listeners with same priority level will be executed at the same order as they were added. (default = 0)
         * @return {SignalBinding} An Object representing the binding between the Signal and listener.
         */
        add : function (listener, listenerContext, priority) {
            validateListener(listener, 'add');
            return this._registerListener(listener, false, listenerContext, priority);
        },

        /**
         * Add listener to the signal that should be removed after first execution (will be executed only once).
         * @param {Function} listener Signal handler function.
         * @param {Object} [listenerContext] Context on which listener will be executed (object that should represent the `this` variable inside listener function).
         * @param {Number} [priority] The priority level of the event listener. Listeners with higher priority will be executed before listeners with lower priority. Listeners with same priority level will be executed at the same order as they were added. (default = 0)
         * @return {SignalBinding} An Object representing the binding between the Signal and listener.
         */
        addOnce : function (listener, listenerContext, priority) {
            validateListener(listener, 'addOnce');
            return this._registerListener(listener, true, listenerContext, priority);
        },

        /**
         * Remove a single listener from the dispatch queue.
         * @param {Function} listener Handler function that should be removed.
         * @param {Object} [context] Execution context (since you can add the same handler multiple times if executing in a different context).
         * @return {Function} Listener handler function.
         */
        remove : function (listener, context) {
            validateListener(listener, 'remove');

            var i = this._indexOfListener(listener, context);
            if (i !== -1) {
                this._bindings[i]._destroy(); //no reason to a SignalBinding exist if it isn't attached to a signal
                this._bindings.splice(i, 1);
            }
            return listener;
        },

        /**
         * Remove all listeners from the Signal.
         */
        removeAll : function () {
            var n = this._bindings.length;
            while (n--) {
                this._bindings[n]._destroy();
            }
            this._bindings.length = 0;
        },

        /**
         * @return {number} Number of listeners attached to the Signal.
         */
        getNumListeners : function () {
            return this._bindings.length;
        },

        /**
         * Stop propagation of the event, blocking the dispatch to next listeners on the queue.
         * <p><strong>IMPORTANT:</strong> should be called only during signal dispatch, calling it before/after dispatch won't affect signal broadcast.</p>
         * @see Signal.prototype.disable
         */
        halt : function () {
            this._shouldPropagate = false;
        },

        /**
         * Dispatch/Broadcast Signal to all listeners added to the queue.
         * @param {...*} [params] Parameters that should be passed to each handler.
         */
        dispatch : function (params) {
            if (! this.active) {
                return;
            }

            var paramsArr = Array.prototype.slice.call(arguments),
                n = this._bindings.length,
                bindings;

            if (this.memorize) {
                this._prevParams = paramsArr;
            }

            if (! n) {
                //should come after memorize
                return;
            }

            bindings = this._bindings.slice(); //clone array in case add/remove items during dispatch
            this._shouldPropagate = true; //in case `halt` was called before dispatch or during the previous dispatch.

            //execute all callbacks until end of the list or until a callback returns `false` or stops propagation
            //reverse loop since listeners with higher priority will be added at the end of the list
            do { n--; } while (bindings[n] && this._shouldPropagate && bindings[n].execute(paramsArr) !== false);
        },

        /**
         * Forget memorized arguments.
         * @see Signal.memorize
         */
        forget : function(){
            this._prevParams = null;
        },

        /**
         * Remove all bindings from signal and destroy any reference to external objects (destroy Signal object).
         * <p><strong>IMPORTANT:</strong> calling any method on the signal instance after calling dispose will throw errors.</p>
         */
        dispose : function () {
            this.removeAll();
            delete this._bindings;
            delete this._prevParams;
        },

        /**
         * @return {string} String representation of the object.
         */
        toString : function () {
            return '[Signal active:'+ this.active +' numListeners:'+ this.getNumListeners() +']';
        }

    };


    // Namespace -----------------------------------------------------
    //================================================================

    /**
     * Signals namespace
     * @namespace
     * @name signals
     */
    var signals = Signal;

    /**
     * Custom event broadcaster
     * @see Signal
     */
    // alias for backwards compatibility (see #gh-44)
    signals.Signal = Signal;



    //exports to multiple environments
    if(typeof define === 'function' && define.amd){ //AMD
        define(function () { return signals; });
    } else if (typeof module !== 'undefined' && module.exports){ //node
        module.exports = signals;
    } else { //browser
        //use string because of Google closure compiler ADVANCED_MODE
        /*jslint sub:true */
        global['signals'] = signals;
    }

}(this));

},{}],4:[function(require,module,exports){
/**
 * Run a step of modifying a node graph. This takes a JSON structure as can
 * be seen in the src/actions folder that then defines how to modify the node
 * graph.
 */

const NODE_SPREAD = 0.01

exports.addNode = function ({el, nodes, links}, node) {
  // Allow nodes to be renamed later on, but always revert when re-adding.
  if(node.rename) {
    node.rename = ""
  }

  if(nodes.find(({id}) => id === node)) {
    throw new Error('A node already exists with that id')
  }

  // Nodes tend to be funky with the force layout when incrementally added.
  // Place them near the center randomly to aid in the layout on the screen.
  if(node.x === undefined) {
    const w = el.offsetWidth
    const h = el.offsetHeight / 2
    node.x = w / 2 + (Math.random() * w - w / 2) * NODE_SPREAD
    node.y = h / 2 + (Math.random() * h - h / 2) * NODE_SPREAD
  }
  nodes.push(node)
},

exports.rename = function ({nodes, links}, [id, value]) {
  const node = nodes.find(n => n.id === id)
  if (!node) throw new Error("Could not find that node to remove.")
  node.rename = value
},

exports.addLink = function ({nodes, links}, link) {
  const {source, target, display, dashed} = link;
  const sourceNode = typeof source === 'object'
    ? source
    : nodes.find(({id}) => id === source)
  const targetNode = typeof source === 'object'
    ? target
    : nodes.find(({id}) => id === target)
  if(!sourceNode || !targetNode) {
    throw new Error(`Could not find those nodes to link. "${source}" to "${target}"`)
  }
  link.source = sourceNode
  link.target = targetNode
  if(link.rename) link.rename = ""
  links.push(link)
},

exports.removeNode = function ({nodes, links}, id) {
  const node = nodes.find(n => n.id === id)
  if (!node) throw new Error("Could not find that node to remove.")
  nodes.splice(nodes.indexOf(node), 1)

  const sources = links.filter(({source}) => source.id === id)
  sources.forEach(source => links.splice(links.indexOf(source), 1))

  const targets = links.filter(({_, target}) => target.id === id)
  targets.forEach(target => links.splice(links.indexOf(target), 1))
},

exports.removeLink = function ({nodes, links}, [sourceId, targetId]) {
  const link = links.find(({source, target}) => {
    return source.id === sourceId && target.id === targetId
  })
  if (!link) throw new Error("Could not find that link to remove.")
  links.splice(links.indexOf(link), 1)
}

exports.renameLink = function ({nodes, links}, {source, target, display}) {
  const link = links.find((b) => {
    return b.source.id === source && b.target.id === target
  })
  if (!link) throw new Error("Could not find that link to remove.")
  link.rename = display
}


exports.highlight = function ({editor}, value) {

  let [start, end] = Array.isArray(value) ? value : [value, value]
  let [startLine, startCh] = String(start).split(':')
  let [endLine, endCh] = String(end).split(':')

  if(!endCh) {
    endLine++
  }
  startCh = Math.max(0, startCh-1)
  endCh = Math.max(0, endCh-1)

  editor.markText(
    {line: startLine - 1, ch: startCh || 0},
    {line: endLine - 1, ch: endCh || 0},
    {
      className: "highlighted-line"
    }
  )
}

},{}],5:[function(require,module,exports){
exports.code = `function saySomething() {
  var message = "Luke, I am your father.";
  console.log(message);
}

function whisperSomething() {
  message = "I see dead people.";
  console.log(message);
}

function shoutSomething() {
  this.message = "I sound my barbaric yawp.";
  console.log(this.message);
}

saySomething();
whisperSomething();
shoutSomething();
`

exports.steps = [
  [
    ["addNode", {type: "window", id: "window"}],
    ["addNode", {type: "callStack", id: "callStack"}],
  ],
  [
    //saySomething();
    ["highlight", 16],
    ["addNode", {type: "function", id: "saySomething", display: "scope"}],
    ["addLink", {source: "callStack", target: "saySomething", display: "saySomething"}],
  ],
  [
    //var message = "Luke, I am your father.";
    ["highlight", 2],
    ["addNode", {type: "value", display: "Luke, I am your father.", id: "message1"}],
    ["addLink", {source: "saySomething", target: "message1", display: "message", distance: 1.5}],
  ],
  [
    ["removeNode", "saySomething"],
    ["highlight", [1,4]],
  ],
  [
    ["removeNode", "message1"],
  ],
  [
    //whisperSomething();
    ["highlight", 17],
    ["addNode", {type: "function", id: "whisperSomething", display: "scope"}],
    ["addLink", {source: "callStack", target: "whisperSomething", display: "whisperSomething"}],
  ],
  [
    //var message = "Luke, I am your father.";
    ["highlight", 7],
    ["addNode", {type: "value", display: "I see dead people.", id: "message2"}],
    ["addLink", {source: "window", target: "message2", display: "message", distance: 1.5}],
    ["addLink", {source: "whisperSomething", target: "message2", display: "window.message", distance: 2.5, dashed: true}],
  ],
  [
    ["removeNode", "whisperSomething"],
    ["highlight", [6,9]],
  ],
  [
    //shoutSomething();
    ["highlight", 18],
    ["addNode", {type: "function", id: "shoutSomething", display: "scope"}],
    ["addLink", {source: "callStack", target: "shoutSomething", display: "shoutSomething"}],
  ],
  [
    //var message = "Luke, I am your father.";
    ["highlight", 12],
    ["addNode", {type: "value", display: "I sound my barbaric yawp.", id: "message3"}],
    ["addLink", {source: "shoutSomething", target: "message3", display: "window.message", distance: 2.5, dashed: true}],
    ["removeLink", ["window", "message2"]],
    ["addLink", {source: "window", target: "message3", display: "message", distance: 1.5}],
  ],
  [
    ["removeNode", "message2"],
  ],
  [
    ["removeNode", "shoutSomething"],
    ["highlight", [11,14]],
  ],
  [
  ],
]

},{}],6:[function(require,module,exports){
exports.code = `var myNumber = 0;
var myObject = {foo: 'bar'};
var myArray = ['a','b','c','d','e'];

function myFunction() {
  console.log('Well this is fun')
}

myNumber = undefined;
myObject = undefined;
delete window.myFunction;

setTimeout(function() {
  myArray = undefined;
}, 10000);
`

exports.lineLength = 60

exports.steps = [
  [
    ["addNode", {type: "window", id: "window"}],
  ],
  [
    ["addNode", {type: "value", id: "myNumber", display: "0"}],
    ["addLink", {source: "window", target: "myNumber", display: "myNumber", distance: 1.5}],
    ["highlight", 1],
  ],
  [
    ["addNode", {type: "object", id: "myObject", display: "{ }"}],
    ["addLink", {source: "window", target: "myObject", display: "myObject"}],
    ["highlight", 2],
  ],
  [
    ["addNode", {type: "array", id: "myArray", display: "[ ]"}],
    ["addNode", {type: "value", id: "array-a", display: "a"}],
    ["addNode", {type: "value", id: "array-b", display: "b"}],
    ["addNode", {type: "value", id: "array-c", display: "c"}],
    ["addNode", {type: "value", id: "array-d", display: "d"}],
    ["addNode", {type: "value", id: "array-e", display: "e"}],
    ["addLink", {source: "window", target: "myArray", display: "myArray"}],
    ["addLink", {source: "myArray", target: "array-a"}],
    ["addLink", {source: "myArray", target: "array-b"}],
    ["addLink", {source: "myArray", target: "array-c"}],
    ["addLink", {source: "myArray", target: "array-d"}],
    ["addLink", {source: "myArray", target: "array-e"}],
    ["highlight", 3],
  ],
  [
    ["addNode", {type: "function", id: "myFunction", display: "function() {}"}],
    ["addLink", {source: "window", target: "myFunction", display: "myFunction"}],
    ["highlight", [5,7]],
  ],
  [
    ["removeLink", ["window", "myNumber"]],
    ["highlight", 9],
  ],
  [
    ["removeLink", ["window", "myObject"]],
    ["highlight", 10],
  ],
  [
    ["removeLink", ["window", "myFunction"]],
    ["highlight", 11],
  ],
  [
    ["highlight", [13, 15]],
  ],
  [
    ["removeNode", "myNumber"],
  ],
  [
    ["removeNode", "myObject"],
  ],
  [
    ["removeNode", "myFunction"],
  ],
  [
    ["removeLink", ["window", "myArray"]],
    ["highlight", 14],
  ],
  [
    ["removeNode", "myArray"],
    ["removeNode", "array-a"],
    ["removeNode", "array-b"],
    ["removeNode", "array-c"],
    ["removeNode", "array-d"],
    ["removeNode", "array-e"],
  ],
]

},{}],7:[function(require,module,exports){
exports.code = `function MyBigApp() { ... }

var myApp = new MyBigApp();

$('#close-button').click(
  myApp.close.bind(myApp)
);

myApp = undefined;
`

exports.steps = [
  [
    ["addNode", {type: "window", id: "window"}],
    ["addNode", {display: "#close-button", type: "object", id: "button"}],
    ["addLink", {source: "window", target: "button", dashed: true}],
    // ["addNode", {type: "callStack", id: "callStack"}],
  ],
  [
    ["highlight", 1],
  ],
  [
    ["addNode", {display: ". . ..  { }", type: "object", id: "myApp", radius: 3}],
    ["addLink", {source: "window", target: "myApp", display: "myApp", distance: 2}],
    ["highlight", 3],
  ],
  [
    ["addNode", {display: "myApp.close()", type: "object", id: "close"}],
    ["addLink", {source: "close", target: "myApp", display: "bind", distance: 2}],
    ["highlight", 6],
  ],
  [
    ["addLink", {source: "button", target: "close", display: "click handler", distance: 2}],
    ["highlight", [5, 7]],
  ],
  [
    ["removeLink", ["window","myApp"]],
  ]
]

},{}],8:[function(require,module,exports){
exports.code = `function createTenElements() {
  var array = [];

  for(var i=0; i < 10; i++) {
    array[i] = i;
  }

  return array;
}

var myArray = createTenElements();
`

exports.steps = [
  [
    ["addNode", {type: "window", id: "window"}],
    ["addNode", {type: "callStack", id: "callStack"}],
    // ["addLink", {source: "window", target: "callStack", dashed: true}],
  ],
  [
    ["highlight", [1, 9]]
  ],
  [
    ["addNode", {display: "scope", type: "function", id: "createTenElements"}],
    ["addLink", {source: "callStack", target: "createTenElements", display: "createTenElements"}],
    ["highlight", ["11:15", "11:34"]]
  ],
  [
    ["addNode", {display: "[ ]", type: "array", id: "array"}],
    ["addLink", {display: "array", source: "createTenElements", target: "array"}],
    ["highlight", ["2:3", "2:18"]],
  ],
  [
    ["highlight", [4, 6]],
    ["addNode", {display: " ", type: "value", id: "array-0"}],
    ["addNode", {display: " ", type: "value", id: "array-1"}],
    ["addNode", {display: " ", type: "value", id: "array-2"}],
    ["addNode", {display: " ", type: "value", id: "array-3"}],
    ["addNode", {display: " ", type: "value", id: "array-4"}],
    ["addNode", {display: " ", type: "value", id: "array-5"}],
    ["addNode", {display: " ", type: "value", id: "array-6"}],
    ["addNode", {display: " ", type: "value", id: "array-7"}],
    ["addNode", {display: " ", type: "value", id: "array-8"}],
    ["addNode", {display: " ", type: "value", id: "array-9"}],
    ["addLink", {display: "0", distance: 0.1, source: "array", target: "array-0"}],
    ["addLink", {display: "1", distance: 0.1, source: "array", target: "array-1"}],
    ["addLink", {display: "2", distance: 0.1, source: "array", target: "array-2"}],
    ["addLink", {display: "3", distance: 0.1, source: "array", target: "array-3"}],
    ["addLink", {display: "4", distance: 0.1, source: "array", target: "array-4"}],
    ["addLink", {display: "5", distance: 0.1, source: "array", target: "array-5"}],
    ["addLink", {display: "6", distance: 0.1, source: "array", target: "array-6"}],
    ["addLink", {display: "7", distance: 0.1, source: "array", target: "array-7"}],
    ["addLink", {display: "8", distance: 0.1, source: "array", target: "array-8"}],
    ["addLink", {display: "9", distance: 0.1, source: "array", target: "array-9"}],
  ],
  [
    ["highlight", 8],
  ],
  [
    ["removeNode", "createTenElements"],
    // ["removeLink", ["callStack", "createTenElements"]],
    // ["removeLink", ["createTenElements", "array"]],
    ["addLink", {display: "myArray", source: "window", target: "array"}],
    ["highlight", ["11:1", "11:12"]]
  ]
]

},{}],9:[function(require,module,exports){
exports.code = `function createTenElements() {
  var array = [];

  for(var i=0; i < 10; i++) {
    array[i] = i;
  }
}

createTenElements();
`

exports.steps = [
  [
    ["addNode", {type: "window", id: "window"}],
    ["addNode", {type: "callStack", id: "callStack"}],
    // ["addLink", {source: "window", target: "callStack", dashed: true}],
  ],
  [
    ["highlight", [1, 7]]
  ],
  [
    ["addNode", {display: "scope", type: "function", id: "createTenElements"}],
    ["addLink", {source: "callStack", target: "createTenElements", display: "createTenElements"}],
    ["highlight", 9]
  ],
  [
    ["addNode", {display: "[ ]", type: "array", id: "array"}],
    ["addLink", {display: "array", source: "createTenElements", target: "array"}],
    ["highlight", ["2:3", "2:18"]],
  ],
  [
    ["highlight", [4, 6]],
    ["addNode", {display: " ", type: "value", id: "array-0"}],
    ["addNode", {display: " ", type: "value", id: "array-1"}],
    ["addNode", {display: " ", type: "value", id: "array-2"}],
    ["addNode", {display: " ", type: "value", id: "array-3"}],
    ["addNode", {display: " ", type: "value", id: "array-4"}],
    ["addNode", {display: " ", type: "value", id: "array-5"}],
    ["addNode", {display: " ", type: "value", id: "array-6"}],
    ["addNode", {display: " ", type: "value", id: "array-7"}],
    ["addNode", {display: " ", type: "value", id: "array-8"}],
    ["addNode", {display: " ", type: "value", id: "array-9"}],
    ["addLink", {display: "0", distance: 0.1, source: "array", target: "array-0"}],
    ["addLink", {display: "1", distance: 0.1, source: "array", target: "array-1"}],
    ["addLink", {display: "2", distance: 0.1, source: "array", target: "array-2"}],
    ["addLink", {display: "3", distance: 0.1, source: "array", target: "array-3"}],
    ["addLink", {display: "4", distance: 0.1, source: "array", target: "array-4"}],
    ["addLink", {display: "5", distance: 0.1, source: "array", target: "array-5"}],
    ["addLink", {display: "6", distance: 0.1, source: "array", target: "array-6"}],
    ["addLink", {display: "7", distance: 0.1, source: "array", target: "array-7"}],
    ["addLink", {display: "8", distance: 0.1, source: "array", target: "array-8"}],
    ["addLink", {display: "9", distance: 0.1, source: "array", target: "array-9"}],
  ],
  [
    ["removeNode", "createTenElements"],
  ],
  [
    ["removeNode", "array"],
    ["removeNode", "array-0"],
    ["removeNode", "array-1"],
    ["removeNode", "array-2"],
    ["removeNode", "array-3"],
    ["removeNode", "array-4"],
    ["removeNode", "array-5"],
    ["removeNode", "array-6"],
    ["removeNode", "array-7"],
    ["removeNode", "array-8"],
    ["removeNode", "array-9"],
  ]
]

},{}],10:[function(require,module,exports){
exports.code = `var someList = [];

var obj1 = { link: someList };
var obj2 = { link: someList };
var obj3 = { link: someList };
var obj4 = { link: someList };

obj1 = undefined;
obj2 = undefined;
obj3 = undefined;
obj4 = undefined;
`

exports.steps = [
  [
    ["addNode", {type: "window", id: "window"}],
  ],
  [
    ["addNode", {display: "[ ]", type: "array", id: "someList"}],
    ["addLink", {source: "window", target:"someList", display: "someList", distance: 3}],
    ["highlight", 1],
  ],
  [
    ["addNode", {display: "{ }", type: "object", id: "obj1"}],
    ["addLink", {source: "obj1", target: "someList", display: "link"}],
    ["addLink", {source: "window", target:"obj1", display: "obj1"}],
    ["highlight", 3],
  ],
  [
    ["addNode", {display: "{ }", type: "object", id: "obj2"}],
    ["addLink", {source: "obj2", target: "someList", display: "link"}],
    ["addLink", {source: "window", target:"obj2", display: "obj2"}],
    ["highlight", 4],
  ],
  [
    ["addNode", {display: "{ }", type: "object", id: "obj3"}],
    ["addLink", {source: "obj3", target: "someList", display: "link"}],
    ["addLink", {source: "window", target:"obj3", display: "obj3"}],
    ["highlight", 5],
  ],
  [
    ["addNode", {display: "{ }", type: "object", id: "obj4"}],
    ["addLink", {source: "obj4", target: "someList", display: "link"}],
    ["addLink", {source: "window", target:"obj4", display: "obj4"}],
    ["highlight", 6],
  ],
  [
    ["removeLink", ["window", "obj1"]],
    ["highlight", 8],
  ],
  [
    ["removeLink", ["window", "obj2"]],
    ["highlight", 9],
  ],
  [
    ["removeLink", ["window", "obj3"]],
    ["highlight", 10],
  ],
  [
    ["removeLink", ["window", "obj4"]],
    ["highlight", 11],
  ],
  [
    ["removeNode", "obj1"],
  ],
  [
    ["removeNode", "obj2"],
  ],
  [
    ["removeNode", "obj3"],
  ],
  [
    ["removeNode", "obj4"],
  ]
]

},{}],11:[function(require,module,exports){
exports.code = `function createLogger() {
  var messages = [];

  return function logger(message) {
    messages.push(message);
    console.log(messages);
  }
}

var captainsLog = createLogger();
var bosunsLog = createLogger();

captainsLog("Captain's log");
captainsLog("Supplemental");

bosunsLog("Bosun is short for boatswain.")
bosunsLog("Swab the deck matey.")

captainsLog = undefined
bosunsLog = undefined
`

exports.steps = [
  [
    ["addNode", {type: "window", id: "window"}],
  ],
  [
    // function definition
    ["highlight", [1,8]],
  ],
  [
    // createLogger()
    ["addNode", {type: "callStack", id: "callStack"}],
    ["highlight", ["10:19", "10:33"]],
  ],
  [
    // function block
    ["addNode", {display: "scope", type: "function", id: "createLogger"}],
    ["addLink", {source: "callStack", target: "createLogger", display: "createLogger"}],
    ["highlight", [2, 7]],
  ],
  [
    // var messages = []
    ["addNode", {display: "[ ]", type: "array", id: "messages1"}],
    ["addLink", {source: "createLogger", target: "messages1", display: "messages"}],
    ["highlight", 2],
  ],
  [
    // function logger() {}
    ["addNode", {display: "fn", type: "function", id: "captainsLog"}],
    ["addLink", {source: "createLogger", target: "captainsLog", display: "logger"}],
    ["highlight", ["4:10", "7:4"]],
  ],
  [
    // messages
    ["addLink", {source: "captainsLog", target: "messages1", display: "messages"}],
    ["highlight", ["5:5", "5:13"]],
  ],
  [
    // return
    ["removeNode", "createLogger"],
    ["removeNode", "callStack"],
    ["highlight", ["4:3", "4:9"]],
  ],
  [
    // var captainsLog
    ["addLink", {source: "window", target: "captainsLog", display: "captainsLog"}],
    ["highlight", ["10:1", "10:16"]],
  ],
  [
    // var bosunsLog = createLogger()
    ["addNode", {display: "[ ]", type: "array", id: "messages2"}],
    ["addNode", {display: "fn", type: "function", id: "bosunsLog"}],
    ["addLink", {source: "window", target: "bosunsLog", display: "bonsunsLog"}],
    ["addLink", {source: "bosunsLog", target: "messages2", display: "messages"}],
    ["highlight", 11],
  ],
  [
    // captainsLog("Captain's log")
    ["highlight", 13],
  ],
  [
    // messages.push(message)
    ["addNode", {display: '"Captain\'s log"', type: "value", id: "string1"}],
    ["addLink", {source: "messages1", target: "string1"}],
    ["highlight", 5],
  ],
  [
    // console.log(messages)
    ["highlight", 6],
  ],
  [
    // captainsLog("Supplemental");
    ["addNode", {display: '"Supplemental"', type: "value", id: "string2"}],
    ["addLink", {source: "messages1", target: "string2"}],
    ["highlight", 14],
  ],
  [
    // bosunsLog("Bosun is short for botswain.")
    ["highlight", 16],
    ["addNode", {display: '"Bosun is..."', type: "value", id: "string3"}],
    ["addLink", {source: "messages2", target: "string3"}],
  ],
  [
    // bosunsLog("Swab the deck")
    ["highlight", 17],
    ["addNode", {display: '"Swab the deck..."', type: "value", id: "string4"}],
    ["addLink", {source: "messages2", target: "string4"}],
  ],
  [
    // captainsLog = undefined
    ["highlight", 19],
    ["removeLink", ["window", "captainsLog"]],
  ],
  [
    // bosunsLog = undefined
    ["highlight", 20],
    ["removeLink", ["window", "bosunsLog"]],
  ],
  [
    ["removeNode", "captainsLog"],
    ["removeNode", "bosunsLog"],
    ["removeNode", "string1"],
    ["removeNode", "string2"],
    ["removeNode", "string3"],
    ["removeNode", "string4"],
    ["removeNode", "messages1"],
    ["removeNode", "messages2"],
  ],
]

},{}],12:[function(require,module,exports){
exports.code = `function ClickCounter() {
  this.countClicks = 0;
  var scope = this;
  this.handler = function buttonClick() {
    scope.countClicks++;
  };

  $('button').on('click', this.handler);
}

ClickCounter.prototype.destroy = function() {
  $('button').off('click', this.handler);
}

var clickCounter1 = new ClickCounter();
var clickCounter2 = new ClickCounter();
var clickCounter3 = new ClickCounter();

// Stop execution, then later run:

clickCounter1.destroy();
clickCounter2.destroy();
clickCounter3.destroy();

delete clickCounter1;
delete clickCounter2;
delete clickCounter3;
`

exports.steps = [
  [
    ["addNode", {type: "window", id: "window"}],
    ["addNode", {display: "button", type: "object", id: "button"}],
    ["addLink", {source: "window", target: "button", dashed: true}],

    // clickCounter1
    ["addNode", {display: "clickCounter1", type: "object", id: "clickCounter1"}],
    ["addNode", {display: "buttonClick", type: "function", id: "buttonClick1"}],
    ["addLink", {source: "window", target: "clickCounter1"}],
    ["addLink", {source: "buttonClick1", target: "clickCounter1"}],
    ["addLink", {source: "button", target: "buttonClick1"}],

    // clickCounter2
    ["addNode", {display: "clickCounter2", type: "object", id: "clickCounter2"}],
    ["addNode", {display: "buttonClick", type: "function", id: "buttonClick2"}],
    ["addLink", {source: "window", target: "clickCounter2"}],
    ["addLink", {source: "buttonClick2", target: "clickCounter2"}],
    ["addLink", {source: "button", target: "buttonClick2"}],

    // clickCounter3
    ["addNode", {display: "clickCounter3", type: "object", id: "clickCounter3"}],
    ["addNode", {display: "buttonClick", type: "function", id: "buttonClick3"}],
    ["addLink", {source: "window", target: "clickCounter3"}],
    ["addLink", {source: "buttonClick3", target: "clickCounter3"}],
    ["addLink", {source: "button", target: "buttonClick3"}],
    ["highlight", 19],
  ],
  [
    ["removeLink", ["button", "buttonClick1"]],
    ["highlight", 21],
  ],
  [
    ["removeLink", ["button", "buttonClick2"]],
    ["highlight", 22],
  ],
  [
    ["removeLink", ["button", "buttonClick3"]],
    ["highlight", 23],
  ],
  [
    ["removeLink", ["window", "clickCounter1"]],
    ["highlight", 25],
  ],
  [
    ["removeLink", ["window", "clickCounter2"]],
    ["highlight", 26],
  ],
  [
    ["removeLink", ["window", "clickCounter3"]],
    ["highlight", 27],
  ],
  [
    ["removeNode", "clickCounter1"],
    ["removeNode", "buttonClick1"],
  ],
  [
    ["removeNode", "clickCounter2"],
    ["removeNode", "buttonClick2"],
  ],
  [
    ["removeNode", "clickCounter3"],
    ["removeNode", "buttonClick3"],
  ]
]

},{}],13:[function(require,module,exports){
exports.code = `function ClickCounter() {
  this.countClicks = 0;

  var scope = this;
  $('button').click(function buttonClick() {
    scope.countClicks++;
  });
}

var clickCounter1 = new ClickCounter();
var clickCounter2 = new ClickCounter();
var clickCounter3 = new ClickCounter();

// Stop execution, then later run:

clickCounter1 = undefined;
clickCounter2 = undefined;
clickCounter3 = undefined;
`

exports.steps = [
  [
    ["addNode", {type: "window", id: "window"}],
    ["addNode", {display: "button", type: "object", id: "button"}],
    ["addLink", {source: "window", target: "button", dashed: true}],
    ["addNode", {type: "callStack", id: "callStack"}],
  ],
  [
    ["highlight", [1, 8]],
  ],
  [
    ["addNode", {display: "{ }", type: "object", id: "clickCounter1"}],
    ["highlight", ["10:21", "10:39"]],
  ],
  [
    // ["addLink", {source: "window", target: "callStack", dashed: true}],
    ["addNode", {display: "scope", type: "function", id: "scope1"}],
    ["addLink", {display: "ClickCounter", source: "callStack", target: "scope1"}],
    ["addLink", {display: "this", source: "scope1", target: "clickCounter1"}],
    ["highlight", [2, 7]],
  ],

  [
    ["addNode", {display: "0", type: "value", id: "countClicks1"}],
    ["addLink", {display: "countClicks", source: "clickCounter1", target: "countClicks1"}],
    ["highlight", ["2:3", "2:24"]],
  ],
  [
    ["renameLink", {display: "this / scope", source: "scope1", target: "clickCounter1"}],
    ["highlight", ["4:3", "4:20"]],
  ],
  [
    ["addNode", {display: "fn", type: "function", id: "buttonClick1"}],
    ["addLink", {source: "scope1", target: "buttonClick1"}],
    ["highlight", ["5:21", "7:4"]],
  ],
  [
    ["addLink", {source: "buttonClick1", target: "clickCounter1"}],
    ["highlight", ["6:5", "6:10"]],
  ],
  [
    ["addLink", {display: "onClick", source: "button", target: "buttonClick1"}],
    ["highlight", [5, 7]],
  ],
  [
    ["removeNode", "countClicks1"]
  ],
  [
    ["removeNode", "scope1"],
  ],
  [
    ["addLink", {display: "clickCounter1", source: "window", target: "clickCounter1", distance: 2}],
    ["highlight", ["10:1", "10:18"]],
  ],
  [
    ["addNode", {display: "{}", type: "object", id: "clickCounter2"}],
    ["addNode", {display: "fn", type: "function", id: "buttonClick2"}],
    ["addLink", {display: "clickCounter2", source: "window", target: "clickCounter2", distance: 2}],
    ["addLink", {source: "buttonClick2", target: "clickCounter2"}],
    ["addLink", {display: "onClick", source: "button", target: "buttonClick2"}],
    ["highlight", 11],
  ],
  [
    ["addNode", {display: "{}", type: "object", id: "clickCounter3"}],
    ["addNode", {display: "fn", type: "function", id: "buttonClick3"}],
    ["addLink", {display: "clickCounter3", source: "window", target: "clickCounter3"}],
    ["addLink", {source: "buttonClick3", target: "clickCounter3"}],
    ["addLink", {display: "onClick", source: "button", target: "buttonClick3"}],
    ["highlight", 12],
  ],
  [
    ["removeLink", ["window", "clickCounter1"]],
    ["highlight", 16],
  ],
  [
    ["removeLink", ["window", "clickCounter2"]],
    ["highlight", 17],
  ],
  [
    ["removeLink", ["window", "clickCounter3"]],
    ["highlight", 18],
  ]
]

},{}],14:[function(require,module,exports){
module.exports = {
  "basics" : require('./basics'),
  "directional" : require('./directional'),
  "create-ten-elements" : require('./create-ten-elements'),
  "create-ten-elements-returns" : require('./create-ten-elements-returns'),
  "accidental-globals" : require('./accidental-globals'),
  "function-capture" : require('./function-capture'),
  "bind-event" : require('./bind-event'),
  "handler-leak" : require('./handler-leak'),
  "handler-leak-fix" : require('./handler-leak-fix'),
  "retaining-paths" : require('./retaining-paths'),
  "object-vs-map" : require('./object-vs-map'),
  "map-cache" : require('./map-cache'),
  "weakmap-cache" : require('./weakmap-cache'),
}

},{"./accidental-globals":5,"./basics":6,"./bind-event":7,"./create-ten-elements":9,"./create-ten-elements-returns":8,"./directional":10,"./function-capture":11,"./handler-leak":13,"./handler-leak-fix":12,"./map-cache":15,"./object-vs-map":16,"./retaining-paths":17,"./weakmap-cache":18}],15:[function(require,module,exports){
exports.code = `var cache = Map();

function getFancyEditor(element) {
  // Check if in cache already.
  var fancyEditor = cache.get(element);
  if (fancyEditor) {
    return fancyEditor;
  }

  // Not in cache, create a new one.
  fancyEditor = new FancyEditor(element);
  cache.set(element, fancyEditor);
  return fancyEditor;
}

var elA = document.querySelector('#comment-box');
var elB = document.querySelector('#admin-editor');

var commentBox1 = getFancyEditor(elA);
var commentBox2 = getFancyEditor(elA);

var commentBox3 = getFancyEditor(elB);
var commentBox4 = getFancyEditor(elB);

commentBox1 = undefined;
commentBox2 = undefined;
commentBox3 = undefined;
commentBox4 = undefined;

elA.remove();
elA = undefined;
elB.remove();
elB = undefined;
`

exports.steps = [
  [
    ["addNode", {type: "window", id: "window"}],
    ["addNode", {type: "callStack", id: "callStack"}],
  // ],
  // [
    // var cache = Map();
    ["addNode", {type: "Map", display: "Map", id: "cache"}],
    ["addLink", {source: "window", target: "cache", display: "cache"}],
    ["highlight", 1],
  ],
  [
    // function getFancyEditor(element) { ... }
    ["highlight", [3,14]],
  ],
  [
    // var elA = document.querySelector('#comment-box');
    ["highlight", 16],
    ["addNode", {id: "elA", type: "object", "display": "< >"}],
    ["addLink", {source: "window", target: "elA", display: "elA"}],
  ],
  [
    // var elB = document.querySelector('#admin-editor');
    ["highlight", 17],
    ["addNode", {id: "elB", type: "object", "display": "< >"}],
    ["addLink", {source: "window", target: "elB", display: "elB"}],
  ],

  //------------------------------------------------------
  // Comment Box 1
  [
    // getFancyEditor(elA)
    ["highlight", ["19:19", "19:38"]],
    ["addNode", {type: "function", display: "scope", id: "scope1"}],
    ["addLink", {source: "callStack", target: "scope1", display: "getFancyEditor"}],
  ],
  [
    // getFancyEditor(element) args
    ["highlight", ["3:25", "3:32"]],
    ["addLink", {source: "scope1", target: "elA", dashed: true}],
  ],
  [
    // var fancyEditor = cache.get(element);
    ["highlight", 5],
    ["addNode", {id: "undefined1", type: "value", display: "undefined"}],
    ["addLink", {source: "scope1", target: "undefined1", display: "fancyEditor", distance: 1.5}],
  ],
  [
    // if (fancyEditor) { ... }
    ["highlight", [6,8]]
  ],
  [
    // fancyEditor = new FancyEditor(element);
    ["highlight", 11],
    ["removeNode", "undefined1"],
    ["addNode", {id: "fancyEditor1", type: "object", display: ". . .. fancyEditor", radius: 3}],
    ["addLink", {source: "scope1", target: "fancyEditor1", display: "fancyEditor", distance: 2.5}],
  ],
  [
    // cache.set(element, fancyEditor);
    ["highlight", 12],
    ["addLink", {source: "cache", target: "fancyEditor1", display: "<elA>     ", distance: 2.5}],
    ["addLink", {source: "cache", target: "elA", display: "key"}],
  ],
  [
    // return fancyEditor;
    ["highlight", 13],
  ],
  [
    // var commentBox1 = getFancyEditor(elA);
    ["highlight", 19],
    ["removeNode", "scope1"],
    ["addLink", {source: "window", target: "fancyEditor1", display: "commentBox1", distance: 2.5}],
  ],

  //------------------------------------------------------
  // Comment Box 2
  [
    // getFancyEditor(elA)
    ["highlight", ["20:19", "20:38"]],
    ["addNode", {type: "function", display: "scope", id: "scope2"}],
    ["addLink", {source: "callStack", target: "scope2", display: "getFancyEditor"}],
  ],
  [
    // getFancyEditor(element) args
    ["highlight", ["3:25", "3:32"]],
    ["addLink", {source: "scope2", target: "elA", dashed: true}],
  ],
  [
    // var fancyEditor = cache.get(element);
    ["highlight", 5],
    ["addLink", {source: "scope2", target: "fancyEditor1", display: "fancyEditor", distance: 2.5}],
  ],
  [
    // if (fancyEditor) { ... }
    ["highlight", [6,8]]
  ],
  [
    // return fancyEditor;
    ["highlight", 7]
  ],
  [
    // var commentBox2 = getFancyEditor(elA);
    ["highlight", 20],
    ["removeNode", "scope2"],
    ["renameLink", {source: "window", target: "fancyEditor1", display: "commentBox1/2", distance: 2.5}],
  ],

  //--------------------------------------------------------
  // Remaining comment boxes
  [
    // var commentBox3 = getFancyEditor(elB);
    // var commentBox4 = getFancyEditor(elB);
    ["addNode", {id: "fancyEditor2", type: "object", display: ". . .. fancyEditor", radius: 3}],
    ["addLink", {source: "cache", target: "fancyEditor2", display: "<elB>     ", distance: 2.5}],
    ["addLink", {source: "cache", target: "elB", display: "key"}],
    ["addLink", {source: "window", target: "fancyEditor2", display: "commentBox3/4", distance: 2.5}],
    ["highlight", [22, 23]],
  ],

  [
    //commentBox1/2 = undefined;
    ["removeLink", ["window", "fancyEditor1"]],
    ["highlight", [25, 26]],
  ],
  [
    // commentBox3/4 = undefined;
    ["removeLink", ["window", "fancyEditor2"]],
    ["highlight", [27, 28]],
  ],
  [
    ["removeLink", ["window", "elA"]],
    ["removeLink", ["window", "elB"]],
    ["highlight", [30, 33]],
  ],
]

},{}],16:[function(require,module,exports){
exports.code = `// Associate the text content of a div with a key.

var id = "myElement";
var div = document.getElementById(id);

var object = {};
object[id] = div.textContent;

console.log(object.myElement);
console.log(object[id]);

var map = new Map();
map.set(id, div.textContent);
map.set(div, div.textContent);

console.log(map.get(div));
console.log(map.get(id));
`

exports.steps = [
  [],
  [
    ["highlight", [3,4]],
  ],
  [
    ["highlight", [6,7]],
  ],
  [
    ["highlight", [9,10]],
  ],
  [
    ["highlight", [12,14]],
  ],
  [
    ["highlight", [16,17]],
  ]
]

},{}],17:[function(require,module,exports){
exports.code = `var a = {};
a.b = {};
a.b.c = {};
a.b.c.d = {};
a.b.c.d.largeThing = new ArrayBuffer(100000);

// Live demo: ./retaining.html
`

exports.steps = [
  [
    ["addNode", {type: "window", id: "window"}],
  ],
  [
    ["addNode", {type: "value", id: "a", display: "{}"}],
    ["addLink", {source: "window", target: "a", display: "a"}],
    ["highlight", 1],
  ],
  [
    ["addNode", {type: "value", id: "b", display: "{}"}],
    ["addLink", {source: "a", target: "b", display: "b"}],
    ["highlight", 2],
  ],
  [
    ["addNode", {type: "value", id: "c", display: "{}"}],
    ["addLink", {source: "b", target: "c", display: "c"}],
    ["highlight", 3],
  ],
  [
    ["addNode", {type: "value", id: "d", display: "{}"}],
    ["addLink", {source: "c", target: "d", display: "d"}],
    ["highlight", 4],
  ],
  [
    ["addNode", {type: "object", id: "largeThing", display: "............. ArrayBuffer", radius: 5}],
    ["addLink", {source: "d", target: "largeThing", distance: 2, display: "largeThing \u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0"}],
    ["highlight", 5],
  ],
]

},{}],18:[function(require,module,exports){
exports.code = `var cache = WeakMap();

function getFancyEditor(element) {
  // Check if in cache already.
  var fancyEditor = cache.get(element);
  if (fancyEditor) {
    return fancyEditor;
  }

  // Not in cache, create a new one.
  fancyEditor = new FancyEditor(element);
  cache.set(element, fancyEditor);
  return fancyEditor;
}

var elA = document.querySelector('#comment-box');
var elB = document.querySelector('#admin-editor');

var commentBox1 = getFancyEditor(elA);
var commentBox2 = getFancyEditor(elA);

var commentBox3 = getFancyEditor(elB);
var commentBox4 = getFancyEditor(elB);

commentBox1 = undefined;
commentBox2 = undefined;
commentBox3 = undefined;
commentBox4 = undefined;

elA.remove();
elA = undefined;
elB.remove();
elB = undefined;
`

exports.steps = [
  [
    ["addNode", {type: "window", id: "window"}],
    ["addNode", {type: "callStack", id: "callStack"}],
  // ],
  // [
    // var cache = WeakMap();
    ["addNode", {type: "Map", display: "WeakMap", id: "cache"}],
    ["addLink", {source: "window", target: "cache", display: "cache"}],
    ["highlight", 1],
  ],
  [
    // Function declaration and els
    ["highlight", [3,17]],
    ["addNode", {id: "elA", type: "object", "display": "< >"}],
    ["addNode", {id: "elB", type: "object", "display": "< >"}],
    ["addLink", {source: "window", target: "elA", display: "elA"}],
    ["addLink", {source: "window", target: "elB", display: "elB"}],
  ],

  //------------------------------------------------------
  // Comment Box 1
  [
    // var commentBox1 = getFancyEditor(elA);
    // var commentBox2 = getFancyEditor(elA);
    ["addNode", {id: "fancyEditor1", type: "object", display: ". . .. fancyEditor", radius: 3}],
    ["addLink", {source: "cache", target: "fancyEditor1", display: "<elA>     ", distance: 2.5, dashed: true}],
    ["addLink", {source: "cache", target: "elA", display: "key", dashed: true}],
    ["addLink", {source: "window", target: "fancyEditor1", display: "commentBox1/2", distance: 2.5}],
    ["highlight", [19, 20]],
  ],

  //--------------------------------------------------------
  // Comment Box 2
  [
    // var commentBox3 = getFancyEditor(elB);
    // var commentBox4 = getFancyEditor(elB);
    ["addNode", {id: "fancyEditor2", type: "object", display: ". . .. fancyEditor", radius: 3}],
    ["addLink", {source: "cache", target: "fancyEditor2", display: "<elB>     ", distance: 2.5, dashed: true}],
    ["addLink", {source: "cache", target: "elB", display: "key", dashed: true}],
    ["addLink", {source: "window", target: "fancyEditor2", display: "commentBox3/4", distance: 2.5}],
    ["highlight", [22, 23]],
  ],
  [
    ["removeLink", ["window", "fancyEditor1"]],
    ["highlight", [25, 26]],
  ],
  [
    ["removeLink", ["window", "fancyEditor2"]],
    ["highlight", [27, 28]],
  ],
  [
    ["removeLink", ["window", "elA"]],
    ["removeLink", ["window", "elB"]],
    ["highlight", [30, 33]],
  ],
  [
    ["removeNode", "fancyEditor1"],
  ],
  [
    ["removeNode", "elA"],
  ],
  [
    ["removeNode", "fancyEditor2"],
  ],
  [
    ["removeNode", "elB"],
  ],
]

},{}],19:[function(require,module,exports){
exports.GROUP = Object.freeze({
  window: 0,
  array: 1,
  object: 2,
  function: 3,
  value: 4,
  callStack: 5,
  Map: 6,
})

exports.SIZE = Object.freeze({
  window: 4,
  callStack: 3,
  function: 3,
  array: 2,
  object: 2,
  Map: 2,
  value: 1
})

exports.LENGTH = Object.freeze({
  window: 10,
  callStack: 10,
  function: 10,
  array: 2,
  object: 2,
  Map: 2,
  value: 0.3
})

},{}],20:[function(require,module,exports){
module.exports = function type (graph, code) {
  const container = document.querySelector('.editor')
  graph.editor = CodeMirror(container, {
    value: code || "// No code provided",
    mode: "javascript",
    lineNumbers: true
  })

  graph.destroy.push(() => document.querySelector('.CodeMirror').remove())
}

},{}],21:[function(require,module,exports){
const { GROUP, SIZE, LENGTH } = require('./constants')
const actionStepper = require('./action-stepper')
const startEditor = require('./editor')

// const { nodes, links } = require('./actions/demo')
// const demo = require('./actions/basics')
// const demo = require('./actions/create-ten-elements')
// const demo = require('./actions/handler-leak')
// const demo = require('./actions/handler-leak-fix')

module.exports = function start(demo) {
  const graph = new MemoryGraph(demo)

  startEditor(graph, demo.code)
  setupForceTick(graph),
  addKeyboardListener(graph),
  addResizeListener(graph, graph.force, graph.el)

  return function destroyVisualization() {
    graph.destroy.forEach(fn => fn())
  }
}

function MemoryGraph({steps, lineLength}) {
  const el = document.querySelector('.node')
  this.el = el
  this.svg = d3.select(".node")
    .append("svg")
    .attr("width", el.offsetWidth)
    .attr("height", el.offsetHeight)

  this.svg
    .append("defs")
      .append("marker")
        .attr("id", "arrow")
        .attr("markerWidth", "13")
        .attr("markerHeight", "13")
        .attr("orient", "auto")
        .attr("refX", "2")
        .attr("refY", "6")
        .append("path")
          .attr("d", "M2,2 L2,11 L10,6 L2,2")
          .style("fill", "#ccc")


  this.color = d3.scale.category20()

  this.lineLength = lineLength || 50
  this.force = d3.layout.force()
      .gravity(0.05)
      .distance(d => SIZE[d.target.type] * 50)
      .charge(-100)
      .size([el.offsetWidth, el.offsetHeight])

  this.$link = this.svg.append("g").selectAll(".link")
  this.$node = this.svg.append("g").selectAll(".node")
  this.nodes = []
  this.links = []
  this.stepsJson = steps
  this.destroy = [() => {
    this.svg.remove()
    this.force.stop()
  }]
}

function runStep(graph, i) {
  graph.editor.getAllMarks().forEach(mark => mark.clear())
  graph.stepsJson[i].forEach(([action, value]) => {
    actionStepper[action](graph, value)
  })
}

function runStepsTo(graph, i) {
  graph.nodes = []
  graph.links = []
  for(let j=0; j <= i; j++) runStep(graph, j)
}

function addKeyboardListener(graph) {
  const KEY_RIGHT = 39
  const KEY_LEFT = 37
  let currentStep = 0
  let {nodes, stepsJson, force} = graph

  runStepsTo(graph, currentStep)
  updateView(graph)

  const handler = e => {
    if(e.keyCode === KEY_RIGHT) {
      const nextStep = Math.min(currentStep + 1, stepsJson.length - 1)
      if (nextStep !== currentStep) {
        currentStep = nextStep
        runStep(graph, currentStep)
        updateView(graph)
      }
    } else if(e.keyCode === KEY_LEFT) {
      const nextStep = Math.max(currentStep - 1, 0)
      if (nextStep !== currentStep) {
        currentStep = nextStep
        runStepsTo(graph, currentStep)
        updateView(graph)
      }
    }
  }
  // Move the graph step left or right by keyboard
  window.addEventListener('keyup', handler)
  graph.destroy.push(() => window.removeEventListener('keyup', handler))
}

function addResizeListener (graph, force, el) {
  const handler = () => {
    d3.select("svg")
      .attr("width", el.offsetWidth)
      .attr("height", el.offsetHeight)

    force.size([el.offsetWidth, el.offsetHeight])
  }
  window.addEventListener('resize', handler)
  graph.destroy.push(() => window.removeEventListener('resize', handler))
}

function getNodeRadius (node) {
  return 5 * SIZE[node.type] * (node.radius || 1)
}

function updateView(graph) {
  const { force, color, nodes, links, el, lineLength } = graph

  // Update the graph's selections with the changed data
  const $node = graph.$node.data(nodes)
  const $link = graph.$link.data(links)
  graph.$node = $node
  graph.$link = $link

  // Update DOM nodes' base group
  $node.enter().append("g")
  $link.enter().append("g")
  $node.exit().remove()
  $link.exit().remove()
  $node.html("")
  $link.html("")

  $node.attr("class", "node")
    .call(force.drag)

  $node.append("circle")
    .attr("class", "node-circle")
    .attr("r", d => getNodeRadius(d))
    .style("fill", d => color(GROUP[d.type]))

  $node.append("text")
    .attr("class", "node-text")
    .attr("dx", d => 5 + 4 * SIZE[d.type])
    .attr("dy", ".35em")
    .style("fill", d => color(GROUP[d.type]))
    // Priority order for text nodes, allow them to be renamed, or use the
    // display name. If none of those exist just use the node name type.
    .text(d => d.rename || d.display || d.type)

  $link.append("line")
    .attr("class", "link")
    .attr("stroke-dasharray", ({dashed}) => dashed ? "5, 5" : false)
    .style("marker-end", "url(#arrow)")

  $link.append("text")
    .attr("class", "edge-text")
    .attr("dy", "-.35em")
    .text(d => d.rename || d.display || "")

  // Restart force graph
  force
    .nodes(nodes)
    .links(links)
    .friction(0.8)
    .charge(-600)
    .gravity(0.1)
    .linkDistance(d => {
      return LENGTH[d.target.type] * el.offsetHeight / 60 + lineLength * (d.distance || 1)
    })
    // .linkStrength(0.01)
    // .theta(0.8)
    // .alpha(0.1)
    .start()
}

function shortenLinks(link, first) {
  const ARROW_OFFSET = 8
  let radius = getNodeRadius(link.target)
  let x = link.target.x - link.source.x
  let y = link.target.y - link.source.y
  let distance = Math.sqrt(x*x + y*y)
  let theta = Math.atan2(y,x)
  if(first) {
    return link.source.x + Math.cos(theta) * (distance - radius - ARROW_OFFSET)
  } else {
    return link.source.y + Math.sin(theta) * (distance - radius - ARROW_OFFSET)
  }
}

function setupForceTick (graph) {
  graph.force.on("tick", () => {
    graph.$node.attr("transform", (d) => `translate(${d.x},${d.y})`)
    graph.$link.select('line')
      .attr("x1", d => d.source.x)
      .attr("y1", d => d.source.y)
      .attr("x2", d => shortenLinks(d, true))
      .attr("y2", d => shortenLinks(d, false))

    graph.$link.select('text')
      .style("transform", d => {
        let x = (d.source.x + d.target.x) / 2
        let y = (d.source.y + d.target.y) / 2
        let dx = d.target.x - d.source.x
        let dy = d.target.y - d.source.y
        let theta = Math.atan2(dy,dx)
        return `translate(${x}px, ${y}px) rotate(${theta}rad)`
      })
  })
}

},{"./action-stepper":4,"./constants":19,"./editor":20}],22:[function(require,module,exports){
const crossroads = require('crossroads');
const hasher = require('hasher');
const startVisualization = require('./visualization')
const actions = require('./actions')

let destroyPreviousVisualization = () => {}

function parseHash (newHash, oldHash) {
  crossroads.parse(newHash);
}

crossroads.addRoute('/{name}', (name) => {
  if(!actions[name]) {
    alert("Could not find that page.")
    hasher.replaceHash('');
    return
  }
  destroyPreviousVisualization()
  destroyPreviousVisualization = startVisualization(actions[name])
});

crossroads.addRoute(/.*/, () => {
  console.log('main route')
  const container = document.querySelector('.node')
  container.innerHTML = `
    <div class='main-titles'>
      <h1 class='title-header'>Understanding Memory in JavaScript</h1>
      <p class='title-subheader'>by Greg Tatum</p>
    </div>
  `
  Object.keys(actions).forEach(key => {
    const div = document.createElement('div')
    div.innerHTML = `
      <a href='#/${key}' class='title-link'>${key}</a><br/>
    `
    container.children[0].appendChild(div)
  })
  destroyPreviousVisualization()
  destroyPreviousVisualization = () => {
    const els = Array.from(document.querySelectorAll('.node > *'))
    els.forEach(el => el.remove())
  }
});

hasher.initialized.add(parseHash); // parse initial hash
hasher.changed.add(parseHash); //parse hash changes
hasher.init(); //start listening for history change

},{"./actions":14,"./visualization":21,"crossroads":1,"hasher":2}]},{},[22])
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJub2RlX21vZHVsZXMvY3Jvc3Nyb2Fkcy9kaXN0L2Nyb3Nzcm9hZHMuanMiLCJub2RlX21vZHVsZXMvaGFzaGVyL2Rpc3QvanMvaGFzaGVyLmpzIiwibm9kZV9tb2R1bGVzL3NpZ25hbHMvZGlzdC9zaWduYWxzLmpzIiwic3JjL2FjdGlvbi1zdGVwcGVyLmpzIiwic3JjL2FjdGlvbnMvYWNjaWRlbnRhbC1nbG9iYWxzLmpzIiwic3JjL2FjdGlvbnMvYmFzaWNzLmpzIiwic3JjL2FjdGlvbnMvYmluZC1ldmVudC5qcyIsInNyYy9hY3Rpb25zL2NyZWF0ZS10ZW4tZWxlbWVudHMtcmV0dXJucy5qcyIsInNyYy9hY3Rpb25zL2NyZWF0ZS10ZW4tZWxlbWVudHMuanMiLCJzcmMvYWN0aW9ucy9kaXJlY3Rpb25hbC5qcyIsInNyYy9hY3Rpb25zL2Z1bmN0aW9uLWNhcHR1cmUuanMiLCJzcmMvYWN0aW9ucy9oYW5kbGVyLWxlYWstZml4LmpzIiwic3JjL2FjdGlvbnMvaGFuZGxlci1sZWFrLmpzIiwic3JjL2FjdGlvbnMvaW5kZXguanMiLCJzcmMvYWN0aW9ucy9tYXAtY2FjaGUuanMiLCJzcmMvYWN0aW9ucy9vYmplY3QtdnMtbWFwLmpzIiwic3JjL2FjdGlvbnMvcmV0YWluaW5nLXBhdGhzLmpzIiwic3JjL2FjdGlvbnMvd2Vha21hcC1jYWNoZS5qcyIsInNyYy9jb25zdGFudHMuanMiLCJzcmMvZWRpdG9yLmpzIiwic3JjL3Zpc3VhbGl6YXRpb24uanMiLCJzcmMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcnRCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN6YkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM3YkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3JHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3JGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxRkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdkNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2xFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3RFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMzRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNsSUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM5RkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2R0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDZkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDM0tBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDckNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ZDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDeEdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM3QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNWQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMzTkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBIiwiZmlsZSI6ImdlbmVyYXRlZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24gZSh0LG4scil7ZnVuY3Rpb24gcyhvLHUpe2lmKCFuW29dKXtpZighdFtvXSl7dmFyIGE9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtpZighdSYmYSlyZXR1cm4gYShvLCEwKTtpZihpKXJldHVybiBpKG8sITApO3ZhciBmPW5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIrbytcIidcIik7dGhyb3cgZi5jb2RlPVwiTU9EVUxFX05PVF9GT1VORFwiLGZ9dmFyIGw9bltvXT17ZXhwb3J0czp7fX07dFtvXVswXS5jYWxsKGwuZXhwb3J0cyxmdW5jdGlvbihlKXt2YXIgbj10W29dWzFdW2VdO3JldHVybiBzKG4/bjplKX0sbCxsLmV4cG9ydHMsZSx0LG4scil9cmV0dXJuIG5bb10uZXhwb3J0c312YXIgaT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2Zvcih2YXIgbz0wO288ci5sZW5ndGg7bysrKXMocltvXSk7cmV0dXJuIHN9KSIsIi8qKiBAbGljZW5zZVxuICogY3Jvc3Nyb2FkcyA8aHR0cDovL21pbGxlcm1lZGVpcm9zLmdpdGh1Yi5jb20vY3Jvc3Nyb2Fkcy5qcy8+XG4gKiBBdXRob3I6IE1pbGxlciBNZWRlaXJvcyB8IE1JVCBMaWNlbnNlXG4gKiB2MC4xMi4yICgyMDE1LzA3LzMxIDE4OjM3KVxuICovXG5cbihmdW5jdGlvbiAoKSB7XG52YXIgZmFjdG9yeSA9IGZ1bmN0aW9uIChzaWduYWxzKSB7XG5cbiAgICB2YXIgY3Jvc3Nyb2FkcyxcbiAgICAgICAgX2hhc09wdGlvbmFsR3JvdXBCdWcsXG4gICAgICAgIFVOREVGO1xuXG4gICAgLy8gSGVscGVycyAtLS0tLS0tLS0tLVxuICAgIC8vPT09PT09PT09PT09PT09PT09PT1cblxuICAgIC8vIElFIDctOCBjYXB0dXJlIG9wdGlvbmFsIGdyb3VwcyBhcyBlbXB0eSBzdHJpbmdzIHdoaWxlIG90aGVyIGJyb3dzZXJzXG4gICAgLy8gY2FwdHVyZSBhcyBgdW5kZWZpbmVkYFxuICAgIF9oYXNPcHRpb25hbEdyb3VwQnVnID0gKC90KC4rKT8vKS5leGVjKCd0JylbMV0gPT09ICcnO1xuXG4gICAgZnVuY3Rpb24gYXJyYXlJbmRleE9mKGFyciwgdmFsKSB7XG4gICAgICAgIGlmIChhcnIuaW5kZXhPZikge1xuICAgICAgICAgICAgcmV0dXJuIGFyci5pbmRleE9mKHZhbCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAvL0FycmF5LmluZGV4T2YgZG9lc24ndCB3b3JrIG9uIElFIDYtN1xuICAgICAgICAgICAgdmFyIG4gPSBhcnIubGVuZ3RoO1xuICAgICAgICAgICAgd2hpbGUgKG4tLSkge1xuICAgICAgICAgICAgICAgIGlmIChhcnJbbl0gPT09IHZhbCkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gbjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gLTE7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiBhcnJheVJlbW92ZShhcnIsIGl0ZW0pIHtcbiAgICAgICAgdmFyIGkgPSBhcnJheUluZGV4T2YoYXJyLCBpdGVtKTtcbiAgICAgICAgaWYgKGkgIT09IC0xKSB7XG4gICAgICAgICAgICBhcnIuc3BsaWNlKGksIDEpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gaXNLaW5kKHZhbCwga2luZCkge1xuICAgICAgICByZXR1cm4gJ1tvYmplY3QgJysga2luZCArJ10nID09PSBPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwodmFsKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBpc1JlZ0V4cCh2YWwpIHtcbiAgICAgICAgcmV0dXJuIGlzS2luZCh2YWwsICdSZWdFeHAnKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBpc0FycmF5KHZhbCkge1xuICAgICAgICByZXR1cm4gaXNLaW5kKHZhbCwgJ0FycmF5Jyk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gaXNGdW5jdGlvbih2YWwpIHtcbiAgICAgICAgcmV0dXJuIHR5cGVvZiB2YWwgPT09ICdmdW5jdGlvbic7XG4gICAgfVxuXG4gICAgLy9ib3Jyb3dlZCBmcm9tIEFNRC11dGlsc1xuICAgIGZ1bmN0aW9uIHR5cGVjYXN0VmFsdWUodmFsKSB7XG4gICAgICAgIHZhciByO1xuICAgICAgICBpZiAodmFsID09PSBudWxsIHx8IHZhbCA9PT0gJ251bGwnKSB7XG4gICAgICAgICAgICByID0gbnVsbDtcbiAgICAgICAgfSBlbHNlIGlmICh2YWwgPT09ICd0cnVlJykge1xuICAgICAgICAgICAgciA9IHRydWU7XG4gICAgICAgIH0gZWxzZSBpZiAodmFsID09PSAnZmFsc2UnKSB7XG4gICAgICAgICAgICByID0gZmFsc2U7XG4gICAgICAgIH0gZWxzZSBpZiAodmFsID09PSBVTkRFRiB8fCB2YWwgPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgICAgICByID0gVU5ERUY7XG4gICAgICAgIH0gZWxzZSBpZiAodmFsID09PSAnJyB8fCBpc05hTih2YWwpKSB7XG4gICAgICAgICAgICAvL2lzTmFOKCcnKSByZXR1cm5zIGZhbHNlXG4gICAgICAgICAgICByID0gdmFsO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgLy9wYXJzZUZsb2F0KG51bGwgfHwgJycpIHJldHVybnMgTmFOXG4gICAgICAgICAgICByID0gcGFyc2VGbG9hdCh2YWwpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiByO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIHR5cGVjYXN0QXJyYXlWYWx1ZXModmFsdWVzKSB7XG4gICAgICAgIHZhciBuID0gdmFsdWVzLmxlbmd0aCxcbiAgICAgICAgICAgIHJlc3VsdCA9IFtdO1xuICAgICAgICB3aGlsZSAobi0tKSB7XG4gICAgICAgICAgICByZXN1bHRbbl0gPSB0eXBlY2FzdFZhbHVlKHZhbHVlc1tuXSk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9XG5cbiAgICAvLyBib3Jyb3dlZCBmcm9tIE1PVVRcbiAgICBmdW5jdGlvbiBkZWNvZGVRdWVyeVN0cmluZyhxdWVyeVN0ciwgc2hvdWxkVHlwZWNhc3QpIHtcbiAgICAgICAgdmFyIHF1ZXJ5QXJyID0gKHF1ZXJ5U3RyIHx8ICcnKS5yZXBsYWNlKCc/JywgJycpLnNwbGl0KCcmJyksXG4gICAgICAgICAgICByZWcgPSAvKFtePV0rKT0oLispLyxcbiAgICAgICAgICAgIGkgPSAtMSxcbiAgICAgICAgICAgIG9iaiA9IHt9LFxuICAgICAgICAgICAgZXF1YWxJbmRleCwgY3VyLCBwVmFsdWUsIHBOYW1lO1xuXG4gICAgICAgIHdoaWxlICgoY3VyID0gcXVlcnlBcnJbKytpXSkpIHtcbiAgICAgICAgICAgIGVxdWFsSW5kZXggPSBjdXIuaW5kZXhPZignPScpO1xuICAgICAgICAgICAgcE5hbWUgPSBjdXIuc3Vic3RyaW5nKDAsIGVxdWFsSW5kZXgpO1xuICAgICAgICAgICAgcFZhbHVlID0gZGVjb2RlVVJJQ29tcG9uZW50KGN1ci5zdWJzdHJpbmcoZXF1YWxJbmRleCArIDEpKTtcbiAgICAgICAgICAgIGlmIChzaG91bGRUeXBlY2FzdCAhPT0gZmFsc2UpIHtcbiAgICAgICAgICAgICAgICBwVmFsdWUgPSB0eXBlY2FzdFZhbHVlKHBWYWx1ZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAocE5hbWUgaW4gb2JqKXtcbiAgICAgICAgICAgICAgICBpZihpc0FycmF5KG9ialtwTmFtZV0pKXtcbiAgICAgICAgICAgICAgICAgICAgb2JqW3BOYW1lXS5wdXNoKHBWYWx1ZSk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgb2JqW3BOYW1lXSA9IFtvYmpbcE5hbWVdLCBwVmFsdWVdO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgb2JqW3BOYW1lXSA9IHBWYWx1ZTtcbiAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBvYmo7XG4gICAgfVxuXG5cbiAgICAvLyBDcm9zc3JvYWRzIC0tLS0tLS0tXG4gICAgLy89PT09PT09PT09PT09PT09PT09PVxuXG4gICAgLyoqXG4gICAgICogQGNvbnN0cnVjdG9yXG4gICAgICovXG4gICAgZnVuY3Rpb24gQ3Jvc3Nyb2FkcygpIHtcbiAgICAgICAgdGhpcy5ieXBhc3NlZCA9IG5ldyBzaWduYWxzLlNpZ25hbCgpO1xuICAgICAgICB0aGlzLnJvdXRlZCA9IG5ldyBzaWduYWxzLlNpZ25hbCgpO1xuICAgICAgICB0aGlzLl9yb3V0ZXMgPSBbXTtcbiAgICAgICAgdGhpcy5fcHJldlJvdXRlcyA9IFtdO1xuICAgICAgICB0aGlzLl9waXBlZCA9IFtdO1xuICAgICAgICB0aGlzLnJlc2V0U3RhdGUoKTtcbiAgICB9XG5cbiAgICBDcm9zc3JvYWRzLnByb3RvdHlwZSA9IHtcblxuICAgICAgICBncmVlZHkgOiBmYWxzZSxcblxuICAgICAgICBncmVlZHlFbmFibGVkIDogdHJ1ZSxcblxuICAgICAgICBpZ25vcmVDYXNlIDogdHJ1ZSxcblxuICAgICAgICBpZ25vcmVTdGF0ZSA6IGZhbHNlLFxuXG4gICAgICAgIHNob3VsZFR5cGVjYXN0IDogZmFsc2UsXG5cbiAgICAgICAgbm9ybWFsaXplRm4gOiBudWxsLFxuXG4gICAgICAgIHJlc2V0U3RhdGUgOiBmdW5jdGlvbigpe1xuICAgICAgICAgICAgdGhpcy5fcHJldlJvdXRlcy5sZW5ndGggPSAwO1xuICAgICAgICAgICAgdGhpcy5fcHJldk1hdGNoZWRSZXF1ZXN0ID0gbnVsbDtcbiAgICAgICAgICAgIHRoaXMuX3ByZXZCeXBhc3NlZFJlcXVlc3QgPSBudWxsO1xuICAgICAgICB9LFxuXG4gICAgICAgIGNyZWF0ZSA6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHJldHVybiBuZXcgQ3Jvc3Nyb2FkcygpO1xuICAgICAgICB9LFxuXG4gICAgICAgIGFkZFJvdXRlIDogZnVuY3Rpb24gKHBhdHRlcm4sIGNhbGxiYWNrLCBwcmlvcml0eSkge1xuICAgICAgICAgICAgdmFyIHJvdXRlID0gbmV3IFJvdXRlKHBhdHRlcm4sIGNhbGxiYWNrLCBwcmlvcml0eSwgdGhpcyk7XG4gICAgICAgICAgICB0aGlzLl9zb3J0ZWRJbnNlcnQocm91dGUpO1xuICAgICAgICAgICAgcmV0dXJuIHJvdXRlO1xuICAgICAgICB9LFxuXG4gICAgICAgIHJlbW92ZVJvdXRlIDogZnVuY3Rpb24gKHJvdXRlKSB7XG4gICAgICAgICAgICBhcnJheVJlbW92ZSh0aGlzLl9yb3V0ZXMsIHJvdXRlKTtcbiAgICAgICAgICAgIHJvdXRlLl9kZXN0cm95KCk7XG4gICAgICAgIH0sXG5cbiAgICAgICAgcmVtb3ZlQWxsUm91dGVzIDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgdmFyIG4gPSB0aGlzLmdldE51bVJvdXRlcygpO1xuICAgICAgICAgICAgd2hpbGUgKG4tLSkge1xuICAgICAgICAgICAgICAgIHRoaXMuX3JvdXRlc1tuXS5fZGVzdHJveSgpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy5fcm91dGVzLmxlbmd0aCA9IDA7XG4gICAgICAgIH0sXG5cbiAgICAgICAgcGFyc2UgOiBmdW5jdGlvbiAocmVxdWVzdCwgZGVmYXVsdEFyZ3MpIHtcbiAgICAgICAgICAgIHJlcXVlc3QgPSByZXF1ZXN0IHx8ICcnO1xuICAgICAgICAgICAgZGVmYXVsdEFyZ3MgPSBkZWZhdWx0QXJncyB8fCBbXTtcblxuICAgICAgICAgICAgLy8gc2hvdWxkIG9ubHkgY2FyZSBhYm91dCBkaWZmZXJlbnQgcmVxdWVzdHMgaWYgaWdub3JlU3RhdGUgaXNuJ3QgdHJ1ZVxuICAgICAgICAgICAgaWYgKCAhdGhpcy5pZ25vcmVTdGF0ZSAmJlxuICAgICAgICAgICAgICAgIChyZXF1ZXN0ID09PSB0aGlzLl9wcmV2TWF0Y2hlZFJlcXVlc3QgfHxcbiAgICAgICAgICAgICAgICAgcmVxdWVzdCA9PT0gdGhpcy5fcHJldkJ5cGFzc2VkUmVxdWVzdCkgKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB2YXIgcm91dGVzID0gdGhpcy5fZ2V0TWF0Y2hlZFJvdXRlcyhyZXF1ZXN0KSxcbiAgICAgICAgICAgICAgICBpID0gMCxcbiAgICAgICAgICAgICAgICBuID0gcm91dGVzLmxlbmd0aCxcbiAgICAgICAgICAgICAgICBjdXI7XG5cbiAgICAgICAgICAgIGlmIChuKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5fcHJldk1hdGNoZWRSZXF1ZXN0ID0gcmVxdWVzdDtcblxuICAgICAgICAgICAgICAgIHRoaXMuX25vdGlmeVByZXZSb3V0ZXMocm91dGVzLCByZXF1ZXN0KTtcbiAgICAgICAgICAgICAgICB0aGlzLl9wcmV2Um91dGVzID0gcm91dGVzO1xuICAgICAgICAgICAgICAgIC8vc2hvdWxkIGJlIGluY3JlbWVudGFsIGxvb3AsIGV4ZWN1dGUgcm91dGVzIGluIG9yZGVyXG4gICAgICAgICAgICAgICAgd2hpbGUgKGkgPCBuKSB7XG4gICAgICAgICAgICAgICAgICAgIGN1ciA9IHJvdXRlc1tpXTtcbiAgICAgICAgICAgICAgICAgICAgY3VyLnJvdXRlLm1hdGNoZWQuZGlzcGF0Y2guYXBwbHkoY3VyLnJvdXRlLm1hdGNoZWQsIGRlZmF1bHRBcmdzLmNvbmNhdChjdXIucGFyYW1zKSk7XG4gICAgICAgICAgICAgICAgICAgIGN1ci5pc0ZpcnN0ID0gIWk7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMucm91dGVkLmRpc3BhdGNoLmFwcGx5KHRoaXMucm91dGVkLCBkZWZhdWx0QXJncy5jb25jYXQoW3JlcXVlc3QsIGN1cl0pKTtcbiAgICAgICAgICAgICAgICAgICAgaSArPSAxO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdGhpcy5fcHJldkJ5cGFzc2VkUmVxdWVzdCA9IHJlcXVlc3Q7XG4gICAgICAgICAgICAgICAgdGhpcy5ieXBhc3NlZC5kaXNwYXRjaC5hcHBseSh0aGlzLmJ5cGFzc2VkLCBkZWZhdWx0QXJncy5jb25jYXQoW3JlcXVlc3RdKSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHRoaXMuX3BpcGVQYXJzZShyZXF1ZXN0LCBkZWZhdWx0QXJncyk7XG4gICAgICAgIH0sXG5cbiAgICAgICAgX25vdGlmeVByZXZSb3V0ZXMgOiBmdW5jdGlvbihtYXRjaGVkUm91dGVzLCByZXF1ZXN0KSB7XG4gICAgICAgICAgICB2YXIgaSA9IDAsIHByZXY7XG4gICAgICAgICAgICB3aGlsZSAocHJldiA9IHRoaXMuX3ByZXZSb3V0ZXNbaSsrXSkge1xuICAgICAgICAgICAgICAgIC8vY2hlY2sgaWYgc3dpdGNoZWQgZXhpc3Qgc2luY2Ugcm91dGUgbWF5IGJlIGRpc3Bvc2VkXG4gICAgICAgICAgICAgICAgaWYocHJldi5yb3V0ZS5zd2l0Y2hlZCAmJiB0aGlzLl9kaWRTd2l0Y2gocHJldi5yb3V0ZSwgbWF0Y2hlZFJvdXRlcykpIHtcbiAgICAgICAgICAgICAgICAgICAgcHJldi5yb3V0ZS5zd2l0Y2hlZC5kaXNwYXRjaChyZXF1ZXN0KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sXG5cbiAgICAgICAgX2RpZFN3aXRjaCA6IGZ1bmN0aW9uIChyb3V0ZSwgbWF0Y2hlZFJvdXRlcyl7XG4gICAgICAgICAgICB2YXIgbWF0Y2hlZCxcbiAgICAgICAgICAgICAgICBpID0gMDtcbiAgICAgICAgICAgIHdoaWxlIChtYXRjaGVkID0gbWF0Y2hlZFJvdXRlc1tpKytdKSB7XG4gICAgICAgICAgICAgICAgLy8gb25seSBkaXNwYXRjaCBzd2l0Y2hlZCBpZiBpdCBpcyBnb2luZyB0byBhIGRpZmZlcmVudCByb3V0ZVxuICAgICAgICAgICAgICAgIGlmIChtYXRjaGVkLnJvdXRlID09PSByb3V0ZSkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH0sXG5cbiAgICAgICAgX3BpcGVQYXJzZSA6IGZ1bmN0aW9uKHJlcXVlc3QsIGRlZmF1bHRBcmdzKSB7XG4gICAgICAgICAgICB2YXIgaSA9IDAsIHJvdXRlO1xuICAgICAgICAgICAgd2hpbGUgKHJvdXRlID0gdGhpcy5fcGlwZWRbaSsrXSkge1xuICAgICAgICAgICAgICAgIHJvdXRlLnBhcnNlKHJlcXVlc3QsIGRlZmF1bHRBcmdzKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcblxuICAgICAgICBnZXROdW1Sb3V0ZXMgOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5fcm91dGVzLmxlbmd0aDtcbiAgICAgICAgfSxcblxuICAgICAgICBfc29ydGVkSW5zZXJ0IDogZnVuY3Rpb24gKHJvdXRlKSB7XG4gICAgICAgICAgICAvL3NpbXBsaWZpZWQgaW5zZXJ0aW9uIHNvcnRcbiAgICAgICAgICAgIHZhciByb3V0ZXMgPSB0aGlzLl9yb3V0ZXMsXG4gICAgICAgICAgICAgICAgbiA9IHJvdXRlcy5sZW5ndGg7XG4gICAgICAgICAgICBkbyB7IC0tbjsgfSB3aGlsZSAocm91dGVzW25dICYmIHJvdXRlLl9wcmlvcml0eSA8PSByb3V0ZXNbbl0uX3ByaW9yaXR5KTtcbiAgICAgICAgICAgIHJvdXRlcy5zcGxpY2UobisxLCAwLCByb3V0ZSk7XG4gICAgICAgIH0sXG5cbiAgICAgICAgX2dldE1hdGNoZWRSb3V0ZXMgOiBmdW5jdGlvbiAocmVxdWVzdCkge1xuICAgICAgICAgICAgdmFyIHJlcyA9IFtdLFxuICAgICAgICAgICAgICAgIHJvdXRlcyA9IHRoaXMuX3JvdXRlcyxcbiAgICAgICAgICAgICAgICBuID0gcm91dGVzLmxlbmd0aCxcbiAgICAgICAgICAgICAgICByb3V0ZTtcbiAgICAgICAgICAgIC8vc2hvdWxkIGJlIGRlY3JlbWVudCBsb29wIHNpbmNlIGhpZ2hlciBwcmlvcml0aWVzIGFyZSBhZGRlZCBhdCB0aGUgZW5kIG9mIGFycmF5XG4gICAgICAgICAgICB3aGlsZSAocm91dGUgPSByb3V0ZXNbLS1uXSkge1xuICAgICAgICAgICAgICAgIGlmICgoIXJlcy5sZW5ndGggfHwgdGhpcy5ncmVlZHkgfHwgcm91dGUuZ3JlZWR5KSAmJiByb3V0ZS5tYXRjaChyZXF1ZXN0KSkge1xuICAgICAgICAgICAgICAgICAgICByZXMucHVzaCh7XG4gICAgICAgICAgICAgICAgICAgICAgICByb3V0ZSA6IHJvdXRlLFxuICAgICAgICAgICAgICAgICAgICAgICAgcGFyYW1zIDogcm91dGUuX2dldFBhcmFtc0FycmF5KHJlcXVlc3QpXG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiAoIXRoaXMuZ3JlZWR5RW5hYmxlZCAmJiByZXMubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiByZXM7XG4gICAgICAgIH0sXG5cbiAgICAgICAgcGlwZSA6IGZ1bmN0aW9uIChvdGhlclJvdXRlcikge1xuICAgICAgICAgICAgdGhpcy5fcGlwZWQucHVzaChvdGhlclJvdXRlcik7XG4gICAgICAgIH0sXG5cbiAgICAgICAgdW5waXBlIDogZnVuY3Rpb24gKG90aGVyUm91dGVyKSB7XG4gICAgICAgICAgICBhcnJheVJlbW92ZSh0aGlzLl9waXBlZCwgb3RoZXJSb3V0ZXIpO1xuICAgICAgICB9LFxuXG4gICAgICAgIHRvU3RyaW5nIDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgcmV0dXJuICdbY3Jvc3Nyb2FkcyBudW1Sb3V0ZXM6JysgdGhpcy5nZXROdW1Sb3V0ZXMoKSArJ10nO1xuICAgICAgICB9XG4gICAgfTtcblxuICAgIC8vXCJzdGF0aWNcIiBpbnN0YW5jZVxuICAgIGNyb3Nzcm9hZHMgPSBuZXcgQ3Jvc3Nyb2FkcygpO1xuICAgIGNyb3Nzcm9hZHMuVkVSU0lPTiA9ICcwLjEyLjInO1xuXG4gICAgY3Jvc3Nyb2Fkcy5OT1JNX0FTX0FSUkFZID0gZnVuY3Rpb24gKHJlcSwgdmFscykge1xuICAgICAgICByZXR1cm4gW3ZhbHMudmFsc19dO1xuICAgIH07XG5cbiAgICBjcm9zc3JvYWRzLk5PUk1fQVNfT0JKRUNUID0gZnVuY3Rpb24gKHJlcSwgdmFscykge1xuICAgICAgICByZXR1cm4gW3ZhbHNdO1xuICAgIH07XG5cblxuICAgIC8vIFJvdXRlIC0tLS0tLS0tLS0tLS0tXG4gICAgLy89PT09PT09PT09PT09PT09PT09PT1cblxuICAgIC8qKlxuICAgICAqIEBjb25zdHJ1Y3RvclxuICAgICAqL1xuICAgIGZ1bmN0aW9uIFJvdXRlKHBhdHRlcm4sIGNhbGxiYWNrLCBwcmlvcml0eSwgcm91dGVyKSB7XG4gICAgICAgIHZhciBpc1JlZ2V4UGF0dGVybiA9IGlzUmVnRXhwKHBhdHRlcm4pLFxuICAgICAgICAgICAgcGF0dGVybkxleGVyID0gcm91dGVyLnBhdHRlcm5MZXhlcjtcbiAgICAgICAgdGhpcy5fcm91dGVyID0gcm91dGVyO1xuICAgICAgICB0aGlzLl9wYXR0ZXJuID0gcGF0dGVybjtcbiAgICAgICAgdGhpcy5fcGFyYW1zSWRzID0gaXNSZWdleFBhdHRlcm4/IG51bGwgOiBwYXR0ZXJuTGV4ZXIuZ2V0UGFyYW1JZHMocGF0dGVybik7XG4gICAgICAgIHRoaXMuX29wdGlvbmFsUGFyYW1zSWRzID0gaXNSZWdleFBhdHRlcm4/IG51bGwgOiBwYXR0ZXJuTGV4ZXIuZ2V0T3B0aW9uYWxQYXJhbXNJZHMocGF0dGVybik7XG4gICAgICAgIHRoaXMuX21hdGNoUmVnZXhwID0gaXNSZWdleFBhdHRlcm4/IHBhdHRlcm4gOiBwYXR0ZXJuTGV4ZXIuY29tcGlsZVBhdHRlcm4ocGF0dGVybiwgcm91dGVyLmlnbm9yZUNhc2UpO1xuICAgICAgICB0aGlzLm1hdGNoZWQgPSBuZXcgc2lnbmFscy5TaWduYWwoKTtcbiAgICAgICAgdGhpcy5zd2l0Y2hlZCA9IG5ldyBzaWduYWxzLlNpZ25hbCgpO1xuICAgICAgICBpZiAoY2FsbGJhY2spIHtcbiAgICAgICAgICAgIHRoaXMubWF0Y2hlZC5hZGQoY2FsbGJhY2spO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuX3ByaW9yaXR5ID0gcHJpb3JpdHkgfHwgMDtcbiAgICB9XG5cbiAgICBSb3V0ZS5wcm90b3R5cGUgPSB7XG5cbiAgICAgICAgZ3JlZWR5IDogZmFsc2UsXG5cbiAgICAgICAgcnVsZXMgOiB2b2lkKDApLFxuXG4gICAgICAgIG1hdGNoIDogZnVuY3Rpb24gKHJlcXVlc3QpIHtcbiAgICAgICAgICAgIHJlcXVlc3QgPSByZXF1ZXN0IHx8ICcnO1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuX21hdGNoUmVnZXhwLnRlc3QocmVxdWVzdCkgJiYgdGhpcy5fdmFsaWRhdGVQYXJhbXMocmVxdWVzdCk7IC8vdmFsaWRhdGUgcGFyYW1zIGV2ZW4gaWYgcmVnZXhwIGJlY2F1c2Ugb2YgYHJlcXVlc3RfYCBydWxlLlxuICAgICAgICB9LFxuXG4gICAgICAgIF92YWxpZGF0ZVBhcmFtcyA6IGZ1bmN0aW9uIChyZXF1ZXN0KSB7XG4gICAgICAgICAgICB2YXIgcnVsZXMgPSB0aGlzLnJ1bGVzLFxuICAgICAgICAgICAgICAgIHZhbHVlcyA9IHRoaXMuX2dldFBhcmFtc09iamVjdChyZXF1ZXN0KSxcbiAgICAgICAgICAgICAgICBrZXk7XG4gICAgICAgICAgICBmb3IgKGtleSBpbiBydWxlcykge1xuICAgICAgICAgICAgICAgIC8vIG5vcm1hbGl6ZV8gaXNuJ3QgYSB2YWxpZGF0aW9uIHJ1bGUuLi4gKCMzOSlcbiAgICAgICAgICAgICAgICBpZihrZXkgIT09ICdub3JtYWxpemVfJyAmJiBydWxlcy5oYXNPd25Qcm9wZXJ0eShrZXkpICYmICEgdGhpcy5faXNWYWxpZFBhcmFtKHJlcXVlc3QsIGtleSwgdmFsdWVzKSl7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfSxcblxuICAgICAgICBfaXNWYWxpZFBhcmFtIDogZnVuY3Rpb24gKHJlcXVlc3QsIHByb3AsIHZhbHVlcykge1xuICAgICAgICAgICAgdmFyIHZhbGlkYXRpb25SdWxlID0gdGhpcy5ydWxlc1twcm9wXSxcbiAgICAgICAgICAgICAgICB2YWwgPSB2YWx1ZXNbcHJvcF0sXG4gICAgICAgICAgICAgICAgaXNWYWxpZCA9IGZhbHNlLFxuICAgICAgICAgICAgICAgIGlzUXVlcnkgPSAocHJvcC5pbmRleE9mKCc/JykgPT09IDApO1xuXG4gICAgICAgICAgICBpZiAodmFsID09IG51bGwgJiYgdGhpcy5fb3B0aW9uYWxQYXJhbXNJZHMgJiYgYXJyYXlJbmRleE9mKHRoaXMuX29wdGlvbmFsUGFyYW1zSWRzLCBwcm9wKSAhPT0gLTEpIHtcbiAgICAgICAgICAgICAgICBpc1ZhbGlkID0gdHJ1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2UgaWYgKGlzUmVnRXhwKHZhbGlkYXRpb25SdWxlKSkge1xuICAgICAgICAgICAgICAgIGlmIChpc1F1ZXJ5KSB7XG4gICAgICAgICAgICAgICAgICAgIHZhbCA9IHZhbHVlc1twcm9wICsnXyddOyAvL3VzZSByYXcgc3RyaW5nXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlzVmFsaWQgPSB2YWxpZGF0aW9uUnVsZS50ZXN0KHZhbCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIGlmIChpc0FycmF5KHZhbGlkYXRpb25SdWxlKSkge1xuICAgICAgICAgICAgICAgIGlmIChpc1F1ZXJ5KSB7XG4gICAgICAgICAgICAgICAgICAgIHZhbCA9IHZhbHVlc1twcm9wICsnXyddOyAvL3VzZSByYXcgc3RyaW5nXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlzVmFsaWQgPSB0aGlzLl9pc1ZhbGlkQXJyYXlSdWxlKHZhbGlkYXRpb25SdWxlLCB2YWwpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSBpZiAoaXNGdW5jdGlvbih2YWxpZGF0aW9uUnVsZSkpIHtcbiAgICAgICAgICAgICAgICBpc1ZhbGlkID0gdmFsaWRhdGlvblJ1bGUodmFsLCByZXF1ZXN0LCB2YWx1ZXMpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4gaXNWYWxpZDsgLy9mYWlsIHNpbGVudGx5IGlmIHZhbGlkYXRpb25SdWxlIGlzIGZyb20gYW4gdW5zdXBwb3J0ZWQgdHlwZVxuICAgICAgICB9LFxuXG4gICAgICAgIF9pc1ZhbGlkQXJyYXlSdWxlIDogZnVuY3Rpb24gKGFyciwgdmFsKSB7XG4gICAgICAgICAgICBpZiAoISB0aGlzLl9yb3V0ZXIuaWdub3JlQ2FzZSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBhcnJheUluZGV4T2YoYXJyLCB2YWwpICE9PSAtMTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKHR5cGVvZiB2YWwgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgICAgICAgdmFsID0gdmFsLnRvTG93ZXJDYXNlKCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHZhciBuID0gYXJyLmxlbmd0aCxcbiAgICAgICAgICAgICAgICBpdGVtLFxuICAgICAgICAgICAgICAgIGNvbXBhcmVWYWw7XG5cbiAgICAgICAgICAgIHdoaWxlIChuLS0pIHtcbiAgICAgICAgICAgICAgICBpdGVtID0gYXJyW25dO1xuICAgICAgICAgICAgICAgIGNvbXBhcmVWYWwgPSAodHlwZW9mIGl0ZW0gPT09ICdzdHJpbmcnKT8gaXRlbS50b0xvd2VyQ2FzZSgpIDogaXRlbTtcbiAgICAgICAgICAgICAgICBpZiAoY29tcGFyZVZhbCA9PT0gdmFsKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfSxcblxuICAgICAgICBfZ2V0UGFyYW1zT2JqZWN0IDogZnVuY3Rpb24gKHJlcXVlc3QpIHtcbiAgICAgICAgICAgIHZhciBzaG91bGRUeXBlY2FzdCA9IHRoaXMuX3JvdXRlci5zaG91bGRUeXBlY2FzdCxcbiAgICAgICAgICAgICAgICB2YWx1ZXMgPSB0aGlzLl9yb3V0ZXIucGF0dGVybkxleGVyLmdldFBhcmFtVmFsdWVzKHJlcXVlc3QsIHRoaXMuX21hdGNoUmVnZXhwLCBzaG91bGRUeXBlY2FzdCksXG4gICAgICAgICAgICAgICAgbyA9IHt9LFxuICAgICAgICAgICAgICAgIG4gPSB2YWx1ZXMubGVuZ3RoLFxuICAgICAgICAgICAgICAgIHBhcmFtLCB2YWw7XG4gICAgICAgICAgICB3aGlsZSAobi0tKSB7XG4gICAgICAgICAgICAgICAgdmFsID0gdmFsdWVzW25dO1xuICAgICAgICAgICAgICAgIGlmICh0aGlzLl9wYXJhbXNJZHMpIHtcbiAgICAgICAgICAgICAgICAgICAgcGFyYW0gPSB0aGlzLl9wYXJhbXNJZHNbbl07XG4gICAgICAgICAgICAgICAgICAgIGlmIChwYXJhbS5pbmRleE9mKCc/JykgPT09IDAgJiYgdmFsKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAvL21ha2UgYSBjb3B5IG9mIHRoZSBvcmlnaW5hbCBzdHJpbmcgc28gYXJyYXkgYW5kXG4gICAgICAgICAgICAgICAgICAgICAgICAvL1JlZ0V4cCB2YWxpZGF0aW9uIGNhbiBiZSBhcHBsaWVkIHByb3Blcmx5XG4gICAgICAgICAgICAgICAgICAgICAgICBvW3BhcmFtICsnXyddID0gdmFsO1xuICAgICAgICAgICAgICAgICAgICAgICAgLy91cGRhdGUgdmFsc18gYXJyYXkgYXMgd2VsbCBzaW5jZSBpdCB3aWxsIGJlIHVzZWRcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vZHVyaW5nIGRpc3BhdGNoXG4gICAgICAgICAgICAgICAgICAgICAgICB2YWwgPSBkZWNvZGVRdWVyeVN0cmluZyh2YWwsIHNob3VsZFR5cGVjYXN0KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhbHVlc1tuXSA9IHZhbDtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAvLyBJRSB3aWxsIGNhcHR1cmUgb3B0aW9uYWwgZ3JvdXBzIGFzIGVtcHR5IHN0cmluZ3Mgd2hpbGUgb3RoZXJcbiAgICAgICAgICAgICAgICAgICAgLy8gYnJvd3NlcnMgd2lsbCBjYXB0dXJlIGB1bmRlZmluZWRgIHNvIG5vcm1hbGl6ZSBiZWhhdmlvci5cbiAgICAgICAgICAgICAgICAgICAgLy8gc2VlOiAjZ2gtNTgsICNnaC01OSwgI2doLTYwXG4gICAgICAgICAgICAgICAgICAgIGlmICggX2hhc09wdGlvbmFsR3JvdXBCdWcgJiYgdmFsID09PSAnJyAmJiBhcnJheUluZGV4T2YodGhpcy5fb3B0aW9uYWxQYXJhbXNJZHMsIHBhcmFtKSAhPT0gLTEgKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB2YWwgPSB2b2lkKDApO1xuICAgICAgICAgICAgICAgICAgICAgICAgdmFsdWVzW25dID0gdmFsO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIG9bcGFyYW1dID0gdmFsO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAvL2FsaWFzIHRvIHBhdGhzIGFuZCBmb3IgUmVnRXhwIHBhdHRlcm5cbiAgICAgICAgICAgICAgICBvW25dID0gdmFsO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgby5yZXF1ZXN0XyA9IHNob3VsZFR5cGVjYXN0PyB0eXBlY2FzdFZhbHVlKHJlcXVlc3QpIDogcmVxdWVzdDtcbiAgICAgICAgICAgIG8udmFsc18gPSB2YWx1ZXM7XG4gICAgICAgICAgICByZXR1cm4gbztcbiAgICAgICAgfSxcblxuICAgICAgICBfZ2V0UGFyYW1zQXJyYXkgOiBmdW5jdGlvbiAocmVxdWVzdCkge1xuICAgICAgICAgICAgdmFyIG5vcm0gPSB0aGlzLnJ1bGVzPyB0aGlzLnJ1bGVzLm5vcm1hbGl6ZV8gOiBudWxsLFxuICAgICAgICAgICAgICAgIHBhcmFtcztcbiAgICAgICAgICAgIG5vcm0gPSBub3JtIHx8IHRoaXMuX3JvdXRlci5ub3JtYWxpemVGbjsgLy8gZGVmYXVsdCBub3JtYWxpemVcbiAgICAgICAgICAgIGlmIChub3JtICYmIGlzRnVuY3Rpb24obm9ybSkpIHtcbiAgICAgICAgICAgICAgICBwYXJhbXMgPSBub3JtKHJlcXVlc3QsIHRoaXMuX2dldFBhcmFtc09iamVjdChyZXF1ZXN0KSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHBhcmFtcyA9IHRoaXMuX2dldFBhcmFtc09iamVjdChyZXF1ZXN0KS52YWxzXztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBwYXJhbXM7XG4gICAgICAgIH0sXG5cbiAgICAgICAgaW50ZXJwb2xhdGUgOiBmdW5jdGlvbihyZXBsYWNlbWVudHMpIHtcbiAgICAgICAgICAgIHZhciBzdHIgPSB0aGlzLl9yb3V0ZXIucGF0dGVybkxleGVyLmludGVycG9sYXRlKHRoaXMuX3BhdHRlcm4sIHJlcGxhY2VtZW50cyk7XG4gICAgICAgICAgICBpZiAoISB0aGlzLl92YWxpZGF0ZVBhcmFtcyhzdHIpICkge1xuICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignR2VuZXJhdGVkIHN0cmluZyBkb2VzblxcJ3QgdmFsaWRhdGUgYWdhaW5zdCBgUm91dGUucnVsZXNgLicpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHN0cjtcbiAgICAgICAgfSxcblxuICAgICAgICBkaXNwb3NlIDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgdGhpcy5fcm91dGVyLnJlbW92ZVJvdXRlKHRoaXMpO1xuICAgICAgICB9LFxuXG4gICAgICAgIF9kZXN0cm95IDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgdGhpcy5tYXRjaGVkLmRpc3Bvc2UoKTtcbiAgICAgICAgICAgIHRoaXMuc3dpdGNoZWQuZGlzcG9zZSgpO1xuICAgICAgICAgICAgdGhpcy5tYXRjaGVkID0gdGhpcy5zd2l0Y2hlZCA9IHRoaXMuX3BhdHRlcm4gPSB0aGlzLl9tYXRjaFJlZ2V4cCA9IG51bGw7XG4gICAgICAgIH0sXG5cbiAgICAgICAgdG9TdHJpbmcgOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICByZXR1cm4gJ1tSb3V0ZSBwYXR0ZXJuOlwiJysgdGhpcy5fcGF0dGVybiArJ1wiLCBudW1MaXN0ZW5lcnM6JysgdGhpcy5tYXRjaGVkLmdldE51bUxpc3RlbmVycygpICsnXSc7XG4gICAgICAgIH1cblxuICAgIH07XG5cblxuXG4gICAgLy8gUGF0dGVybiBMZXhlciAtLS0tLS1cbiAgICAvLz09PT09PT09PT09PT09PT09PT09PVxuXG4gICAgQ3Jvc3Nyb2Fkcy5wcm90b3R5cGUucGF0dGVybkxleGVyID0gKGZ1bmN0aW9uICgpIHtcblxuICAgICAgICB2YXJcbiAgICAgICAgICAgIC8vbWF0Y2ggY2hhcnMgdGhhdCBzaG91bGQgYmUgZXNjYXBlZCBvbiBzdHJpbmcgcmVnZXhwXG4gICAgICAgICAgICBFU0NBUEVfQ0hBUlNfUkVHRVhQID0gL1tcXFxcLisqP1xcXiRcXFtcXF0oKXt9XFwvJyNdL2csXG5cbiAgICAgICAgICAgIC8vdHJhaWxpbmcgc2xhc2hlcyAoYmVnaW4vZW5kIG9mIHN0cmluZylcbiAgICAgICAgICAgIExPT1NFX1NMQVNIRVNfUkVHRVhQID0gL15cXC98XFwvJC9nLFxuICAgICAgICAgICAgTEVHQUNZX1NMQVNIRVNfUkVHRVhQID0gL1xcLyQvZyxcblxuICAgICAgICAgICAgLy9wYXJhbXMgLSBldmVyeXRoaW5nIGJldHdlZW4gYHsgfWAgb3IgYDogOmBcbiAgICAgICAgICAgIFBBUkFNU19SRUdFWFAgPSAvKD86XFx7fDopKFtefTpdKykoPzpcXH18OikvZyxcblxuICAgICAgICAgICAgLy91c2VkIHRvIHNhdmUgcGFyYW1zIGR1cmluZyBjb21waWxlIChhdm9pZCBlc2NhcGluZyB0aGluZ3MgdGhhdFxuICAgICAgICAgICAgLy9zaG91bGRuJ3QgYmUgZXNjYXBlZCkuXG4gICAgICAgICAgICBUT0tFTlMgPSB7XG4gICAgICAgICAgICAgICAgJ09TJyA6IHtcbiAgICAgICAgICAgICAgICAgICAgLy9vcHRpb25hbCBzbGFzaGVzXG4gICAgICAgICAgICAgICAgICAgIC8vc2xhc2ggYmV0d2VlbiBgOjpgIG9yIGB9OmAgb3IgYFxcdzpgIG9yIGA6ez9gIG9yIGB9ez9gIG9yIGBcXHd7P2BcbiAgICAgICAgICAgICAgICAgICAgcmd4IDogLyhbOn1dfFxcdyg/PVxcLykpXFwvPyg6fCg/Olxce1xcPykpL2csXG4gICAgICAgICAgICAgICAgICAgIHNhdmUgOiAnJDF7e2lkfX0kMicsXG4gICAgICAgICAgICAgICAgICAgIHJlcyA6ICdcXFxcLz8nXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAnUlMnIDoge1xuICAgICAgICAgICAgICAgICAgICAvL3JlcXVpcmVkIHNsYXNoZXNcbiAgICAgICAgICAgICAgICAgICAgLy91c2VkIHRvIGluc2VydCBzbGFzaCBiZXR3ZWVuIGA6e2AgYW5kIGB9e2BcbiAgICAgICAgICAgICAgICAgICAgcmd4IDogLyhbOn1dKVxcLz8oXFx7KS9nLFxuICAgICAgICAgICAgICAgICAgICBzYXZlIDogJyQxe3tpZH19JDInLFxuICAgICAgICAgICAgICAgICAgICByZXMgOiAnXFxcXC8nXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAnUlEnIDoge1xuICAgICAgICAgICAgICAgICAgICAvL3JlcXVpcmVkIHF1ZXJ5IHN0cmluZyAtIGV2ZXJ5dGhpbmcgaW4gYmV0d2VlbiBgez8gfWBcbiAgICAgICAgICAgICAgICAgICAgcmd4IDogL1xce1xcPyhbXn1dKylcXH0vZyxcbiAgICAgICAgICAgICAgICAgICAgLy9ldmVyeXRoaW5nIGZyb20gYD9gIHRpbGwgYCNgIG9yIGVuZCBvZiBzdHJpbmdcbiAgICAgICAgICAgICAgICAgICAgcmVzIDogJ1xcXFw/KFteI10rKSdcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICdPUScgOiB7XG4gICAgICAgICAgICAgICAgICAgIC8vb3B0aW9uYWwgcXVlcnkgc3RyaW5nIC0gZXZlcnl0aGluZyBpbiBiZXR3ZWVuIGA6PyA6YFxuICAgICAgICAgICAgICAgICAgICByZ3ggOiAvOlxcPyhbXjpdKyk6L2csXG4gICAgICAgICAgICAgICAgICAgIC8vZXZlcnl0aGluZyBmcm9tIGA/YCB0aWxsIGAjYCBvciBlbmQgb2Ygc3RyaW5nXG4gICAgICAgICAgICAgICAgICAgIHJlcyA6ICcoPzpcXFxcPyhbXiNdKikpPydcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICdPUicgOiB7XG4gICAgICAgICAgICAgICAgICAgIC8vb3B0aW9uYWwgcmVzdCAtIGV2ZXJ5dGhpbmcgaW4gYmV0d2VlbiBgOiAqOmBcbiAgICAgICAgICAgICAgICAgICAgcmd4IDogLzooW146XSspXFwqOi9nLFxuICAgICAgICAgICAgICAgICAgICByZXMgOiAnKC4qKT8nIC8vIG9wdGlvbmFsIGdyb3VwIHRvIGF2b2lkIHBhc3NpbmcgZW1wdHkgc3RyaW5nIGFzIGNhcHR1cmVkXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAnUlInIDoge1xuICAgICAgICAgICAgICAgICAgICAvL3Jlc3QgcGFyYW0gLSBldmVyeXRoaW5nIGluIGJldHdlZW4gYHsgKn1gXG4gICAgICAgICAgICAgICAgICAgIHJneCA6IC9cXHsoW159XSspXFwqXFx9L2csXG4gICAgICAgICAgICAgICAgICAgIHJlcyA6ICcoLispJ1xuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgLy8gcmVxdWlyZWQvb3B0aW9uYWwgcGFyYW1zIHNob3VsZCBjb21lIGFmdGVyIHJlc3Qgc2VnbWVudHNcbiAgICAgICAgICAgICAgICAnUlAnIDoge1xuICAgICAgICAgICAgICAgICAgICAvL3JlcXVpcmVkIHBhcmFtcyAtIGV2ZXJ5dGhpbmcgYmV0d2VlbiBgeyB9YFxuICAgICAgICAgICAgICAgICAgICByZ3ggOiAvXFx7KFtefV0rKVxcfS9nLFxuICAgICAgICAgICAgICAgICAgICByZXMgOiAnKFteXFxcXC8/XSspJ1xuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgJ09QJyA6IHtcbiAgICAgICAgICAgICAgICAgICAgLy9vcHRpb25hbCBwYXJhbXMgLSBldmVyeXRoaW5nIGJldHdlZW4gYDogOmBcbiAgICAgICAgICAgICAgICAgICAgcmd4IDogLzooW146XSspOi9nLFxuICAgICAgICAgICAgICAgICAgICByZXMgOiAnKFteXFxcXC8/XSspP1xcLz8nXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSxcblxuICAgICAgICAgICAgTE9PU0VfU0xBU0ggPSAxLFxuICAgICAgICAgICAgU1RSSUNUX1NMQVNIID0gMixcbiAgICAgICAgICAgIExFR0FDWV9TTEFTSCA9IDMsXG5cbiAgICAgICAgICAgIF9zbGFzaE1vZGUgPSBMT09TRV9TTEFTSDtcblxuXG4gICAgICAgIGZ1bmN0aW9uIHByZWNvbXBpbGVUb2tlbnMoKXtcbiAgICAgICAgICAgIHZhciBrZXksIGN1cjtcbiAgICAgICAgICAgIGZvciAoa2V5IGluIFRPS0VOUykge1xuICAgICAgICAgICAgICAgIGlmIChUT0tFTlMuaGFzT3duUHJvcGVydHkoa2V5KSkge1xuICAgICAgICAgICAgICAgICAgICBjdXIgPSBUT0tFTlNba2V5XTtcbiAgICAgICAgICAgICAgICAgICAgY3VyLmlkID0gJ19fQ1JfJysga2V5ICsnX18nO1xuICAgICAgICAgICAgICAgICAgICBjdXIuc2F2ZSA9ICgnc2F2ZScgaW4gY3VyKT8gY3VyLnNhdmUucmVwbGFjZSgne3tpZH19JywgY3VyLmlkKSA6IGN1ci5pZDtcbiAgICAgICAgICAgICAgICAgICAgY3VyLnJSZXN0b3JlID0gbmV3IFJlZ0V4cChjdXIuaWQsICdnJyk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHByZWNvbXBpbGVUb2tlbnMoKTtcblxuXG4gICAgICAgIGZ1bmN0aW9uIGNhcHR1cmVWYWxzKHJlZ2V4LCBwYXR0ZXJuKSB7XG4gICAgICAgICAgICB2YXIgdmFscyA9IFtdLCBtYXRjaDtcbiAgICAgICAgICAgIC8vIHZlcnkgaW1wb3J0YW50IHRvIHJlc2V0IGxhc3RJbmRleCBzaW5jZSBSZWdFeHAgY2FuIGhhdmUgXCJnXCIgZmxhZ1xuICAgICAgICAgICAgLy8gYW5kIG11bHRpcGxlIHJ1bnMgbWlnaHQgYWZmZWN0IHRoZSByZXN1bHQsIHNwZWNpYWxseSBpZiBtYXRjaGluZ1xuICAgICAgICAgICAgLy8gc2FtZSBzdHJpbmcgbXVsdGlwbGUgdGltZXMgb24gSUUgNy04XG4gICAgICAgICAgICByZWdleC5sYXN0SW5kZXggPSAwO1xuICAgICAgICAgICAgd2hpbGUgKG1hdGNoID0gcmVnZXguZXhlYyhwYXR0ZXJuKSkge1xuICAgICAgICAgICAgICAgIHZhbHMucHVzaChtYXRjaFsxXSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gdmFscztcbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIGdldFBhcmFtSWRzKHBhdHRlcm4pIHtcbiAgICAgICAgICAgIHJldHVybiBjYXB0dXJlVmFscyhQQVJBTVNfUkVHRVhQLCBwYXR0ZXJuKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIGdldE9wdGlvbmFsUGFyYW1zSWRzKHBhdHRlcm4pIHtcbiAgICAgICAgICAgIHJldHVybiBjYXB0dXJlVmFscyhUT0tFTlMuT1Aucmd4LCBwYXR0ZXJuKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIGNvbXBpbGVQYXR0ZXJuKHBhdHRlcm4sIGlnbm9yZUNhc2UpIHtcbiAgICAgICAgICAgIHBhdHRlcm4gPSBwYXR0ZXJuIHx8ICcnO1xuXG4gICAgICAgICAgICBpZihwYXR0ZXJuKXtcbiAgICAgICAgICAgICAgICBpZiAoX3NsYXNoTW9kZSA9PT0gTE9PU0VfU0xBU0gpIHtcbiAgICAgICAgICAgICAgICAgICAgcGF0dGVybiA9IHBhdHRlcm4ucmVwbGFjZShMT09TRV9TTEFTSEVTX1JFR0VYUCwgJycpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBlbHNlIGlmIChfc2xhc2hNb2RlID09PSBMRUdBQ1lfU0xBU0gpIHtcbiAgICAgICAgICAgICAgICAgICAgcGF0dGVybiA9IHBhdHRlcm4ucmVwbGFjZShMRUdBQ1lfU0xBU0hFU19SRUdFWFAsICcnKTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAvL3NhdmUgdG9rZW5zXG4gICAgICAgICAgICAgICAgcGF0dGVybiA9IHJlcGxhY2VUb2tlbnMocGF0dGVybiwgJ3JneCcsICdzYXZlJyk7XG4gICAgICAgICAgICAgICAgLy9yZWdleHAgZXNjYXBlXG4gICAgICAgICAgICAgICAgcGF0dGVybiA9IHBhdHRlcm4ucmVwbGFjZShFU0NBUEVfQ0hBUlNfUkVHRVhQLCAnXFxcXCQmJyk7XG4gICAgICAgICAgICAgICAgLy9yZXN0b3JlIHRva2Vuc1xuICAgICAgICAgICAgICAgIHBhdHRlcm4gPSByZXBsYWNlVG9rZW5zKHBhdHRlcm4sICdyUmVzdG9yZScsICdyZXMnKTtcblxuICAgICAgICAgICAgICAgIGlmIChfc2xhc2hNb2RlID09PSBMT09TRV9TTEFTSCkge1xuICAgICAgICAgICAgICAgICAgICBwYXR0ZXJuID0gJ1xcXFwvPycrIHBhdHRlcm47XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoX3NsYXNoTW9kZSAhPT0gU1RSSUNUX1NMQVNIKSB7XG4gICAgICAgICAgICAgICAgLy9zaW5nbGUgc2xhc2ggaXMgdHJlYXRlZCBhcyBlbXB0eSBhbmQgZW5kIHNsYXNoIGlzIG9wdGlvbmFsXG4gICAgICAgICAgICAgICAgcGF0dGVybiArPSAnXFxcXC8/JztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBuZXcgUmVnRXhwKCdeJysgcGF0dGVybiArICckJywgaWdub3JlQ2FzZT8gJ2knIDogJycpO1xuICAgICAgICB9XG5cbiAgICAgICAgZnVuY3Rpb24gcmVwbGFjZVRva2VucyhwYXR0ZXJuLCByZWdleHBOYW1lLCByZXBsYWNlTmFtZSkge1xuICAgICAgICAgICAgdmFyIGN1ciwga2V5O1xuICAgICAgICAgICAgZm9yIChrZXkgaW4gVE9LRU5TKSB7XG4gICAgICAgICAgICAgICAgaWYgKFRPS0VOUy5oYXNPd25Qcm9wZXJ0eShrZXkpKSB7XG4gICAgICAgICAgICAgICAgICAgIGN1ciA9IFRPS0VOU1trZXldO1xuICAgICAgICAgICAgICAgICAgICBwYXR0ZXJuID0gcGF0dGVybi5yZXBsYWNlKGN1cltyZWdleHBOYW1lXSwgY3VyW3JlcGxhY2VOYW1lXSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHBhdHRlcm47XG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiBnZXRQYXJhbVZhbHVlcyhyZXF1ZXN0LCByZWdleHAsIHNob3VsZFR5cGVjYXN0KSB7XG4gICAgICAgICAgICB2YXIgdmFscyA9IHJlZ2V4cC5leGVjKHJlcXVlc3QpO1xuICAgICAgICAgICAgaWYgKHZhbHMpIHtcbiAgICAgICAgICAgICAgICB2YWxzLnNoaWZ0KCk7XG4gICAgICAgICAgICAgICAgaWYgKHNob3VsZFR5cGVjYXN0KSB7XG4gICAgICAgICAgICAgICAgICAgIHZhbHMgPSB0eXBlY2FzdEFycmF5VmFsdWVzKHZhbHMpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiB2YWxzO1xuICAgICAgICB9XG5cbiAgICAgICAgZnVuY3Rpb24gaW50ZXJwb2xhdGUocGF0dGVybiwgcmVwbGFjZW1lbnRzKSB7XG4gICAgICAgICAgICAvLyBkZWZhdWx0IHRvIGFuIGVtcHR5IG9iamVjdCBiZWNhdXNlIHBhdHRlcm4gbWlnaHQgaGF2ZSBqdXN0XG4gICAgICAgICAgICAvLyBvcHRpb25hbCBhcmd1bWVudHNcbiAgICAgICAgICAgIHJlcGxhY2VtZW50cyA9IHJlcGxhY2VtZW50cyB8fCB7fTtcbiAgICAgICAgICAgIGlmICh0eXBlb2YgcGF0dGVybiAhPT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ1JvdXRlIHBhdHRlcm4gc2hvdWxkIGJlIGEgc3RyaW5nLicpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB2YXIgcmVwbGFjZUZuID0gZnVuY3Rpb24obWF0Y2gsIHByb3Ape1xuICAgICAgICAgICAgICAgICAgICB2YXIgdmFsO1xuICAgICAgICAgICAgICAgICAgICBwcm9wID0gKHByb3Auc3Vic3RyKDAsIDEpID09PSAnPycpPyBwcm9wLnN1YnN0cigxKSA6IHByb3A7XG4gICAgICAgICAgICAgICAgICAgIGlmIChyZXBsYWNlbWVudHNbcHJvcF0gIT0gbnVsbCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHR5cGVvZiByZXBsYWNlbWVudHNbcHJvcF0gPT09ICdvYmplY3QnKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdmFyIHF1ZXJ5UGFydHMgPSBbXSwgcmVwO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGZvcih2YXIga2V5IGluIHJlcGxhY2VtZW50c1twcm9wXSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXAgPSByZXBsYWNlbWVudHNbcHJvcF1ba2V5XTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGlzQXJyYXkocmVwKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZm9yICh2YXIgayBpbiByZXApIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoIGtleS5zbGljZSgtMikgPT0gJ1tdJyApIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcXVlcnlQYXJ0cy5wdXNoKGVuY29kZVVSSShrZXkuc2xpY2UoMCwgLTIpKSArICdbXT0nICsgZW5jb2RlVVJJKHJlcFtrXSkpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHF1ZXJ5UGFydHMucHVzaChlbmNvZGVVUkkoa2V5ICsgJz0nICsgcmVwW2tdKSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcXVlcnlQYXJ0cy5wdXNoKGVuY29kZVVSSShrZXkgKyAnPScgKyByZXApKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB2YWwgPSAnPycgKyBxdWVyeVBhcnRzLmpvaW4oJyYnKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gbWFrZSBzdXJlIHZhbHVlIGlzIGEgc3RyaW5nIHNlZSAjZ2gtNTRcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB2YWwgPSBTdHJpbmcocmVwbGFjZW1lbnRzW3Byb3BdKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKG1hdGNoLmluZGV4T2YoJyonKSA9PT0gLTEgJiYgdmFsLmluZGV4T2YoJy8nKSAhPT0gLTEpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgdmFsdWUgXCInKyB2YWwgKydcIiBmb3Igc2VnbWVudCBcIicrIG1hdGNoICsnXCIuJyk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgZWxzZSBpZiAobWF0Y2guaW5kZXhPZigneycpICE9PSAtMSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdUaGUgc2VnbWVudCAnKyBtYXRjaCArJyBpcyByZXF1aXJlZC4nKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhbCA9ICcnO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB2YWw7XG4gICAgICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgaWYgKCEgVE9LRU5TLk9TLnRyYWlsKSB7XG4gICAgICAgICAgICAgICAgVE9LRU5TLk9TLnRyYWlsID0gbmV3IFJlZ0V4cCgnKD86JysgVE9LRU5TLk9TLmlkICsnKSskJyk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiBwYXR0ZXJuXG4gICAgICAgICAgICAgICAgICAgICAgICAucmVwbGFjZShUT0tFTlMuT1Mucmd4LCBUT0tFTlMuT1Muc2F2ZSlcbiAgICAgICAgICAgICAgICAgICAgICAgIC5yZXBsYWNlKFBBUkFNU19SRUdFWFAsIHJlcGxhY2VGbilcbiAgICAgICAgICAgICAgICAgICAgICAgIC5yZXBsYWNlKFRPS0VOUy5PUy50cmFpbCwgJycpIC8vIHJlbW92ZSB0cmFpbGluZ1xuICAgICAgICAgICAgICAgICAgICAgICAgLnJlcGxhY2UoVE9LRU5TLk9TLnJSZXN0b3JlLCAnLycpOyAvLyBhZGQgc2xhc2ggYmV0d2VlbiBzZWdtZW50c1xuICAgICAgICB9XG5cbiAgICAgICAgLy9BUElcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIHN0cmljdCA6IGZ1bmN0aW9uKCl7XG4gICAgICAgICAgICAgICAgX3NsYXNoTW9kZSA9IFNUUklDVF9TTEFTSDtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBsb29zZSA6IGZ1bmN0aW9uKCl7XG4gICAgICAgICAgICAgICAgX3NsYXNoTW9kZSA9IExPT1NFX1NMQVNIO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGxlZ2FjeSA6IGZ1bmN0aW9uKCl7XG4gICAgICAgICAgICAgICAgX3NsYXNoTW9kZSA9IExFR0FDWV9TTEFTSDtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBnZXRQYXJhbUlkcyA6IGdldFBhcmFtSWRzLFxuICAgICAgICAgICAgZ2V0T3B0aW9uYWxQYXJhbXNJZHMgOiBnZXRPcHRpb25hbFBhcmFtc0lkcyxcbiAgICAgICAgICAgIGdldFBhcmFtVmFsdWVzIDogZ2V0UGFyYW1WYWx1ZXMsXG4gICAgICAgICAgICBjb21waWxlUGF0dGVybiA6IGNvbXBpbGVQYXR0ZXJuLFxuICAgICAgICAgICAgaW50ZXJwb2xhdGUgOiBpbnRlcnBvbGF0ZVxuICAgICAgICB9O1xuXG4gICAgfSgpKTtcblxuXG4gICAgcmV0dXJuIGNyb3Nzcm9hZHM7XG59O1xuXG5pZiAodHlwZW9mIGRlZmluZSA9PT0gJ2Z1bmN0aW9uJyAmJiBkZWZpbmUuYW1kKSB7XG4gICAgZGVmaW5lKFsnc2lnbmFscyddLCBmYWN0b3J5KTtcbn0gZWxzZSBpZiAodHlwZW9mIG1vZHVsZSAhPT0gJ3VuZGVmaW5lZCcgJiYgbW9kdWxlLmV4cG9ydHMpIHsgLy9Ob2RlXG4gICAgbW9kdWxlLmV4cG9ydHMgPSBmYWN0b3J5KHJlcXVpcmUoJ3NpZ25hbHMnKSk7XG59IGVsc2Uge1xuICAgIC8qanNoaW50IHN1Yjp0cnVlICovXG4gICAgd2luZG93Wydjcm9zc3JvYWRzJ10gPSBmYWN0b3J5KHdpbmRvd1snc2lnbmFscyddKTtcbn1cblxufSgpKTtcblxuIiwiLyohIVxuICogSGFzaGVyIDxodHRwOi8vZ2l0aHViLmNvbS9taWxsZXJtZWRlaXJvcy9oYXNoZXI+XG4gKiBAYXV0aG9yIE1pbGxlciBNZWRlaXJvc1xuICogQHZlcnNpb24gMS4yLjAgKDIwMTMvMTEvMTEgMDM6MTggUE0pXG4gKiBSZWxlYXNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2VcbiAqL1xuXG47KGZ1bmN0aW9uICgpIHtcbnZhciBmYWN0b3J5ID0gZnVuY3Rpb24oc2lnbmFscyl7XG5cbi8qanNoaW50IHdoaXRlOmZhbHNlKi9cbi8qZ2xvYmFsIHNpZ25hbHM6ZmFsc2UsIHdpbmRvdzpmYWxzZSovXG5cbi8qKlxuICogSGFzaGVyXG4gKiBAbmFtZXNwYWNlIEhpc3RvcnkgTWFuYWdlciBmb3IgcmljaC1tZWRpYSBhcHBsaWNhdGlvbnMuXG4gKiBAbmFtZSBoYXNoZXJcbiAqL1xudmFyIGhhc2hlciA9IChmdW5jdGlvbih3aW5kb3cpe1xuXG4gICAgLy8tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIC8vIFByaXZhdGUgVmFyc1xuICAgIC8vLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuICAgIHZhclxuXG4gICAgICAgIC8vIGZyZXF1ZW5jeSB0aGF0IGl0IHdpbGwgY2hlY2sgaGFzaCB2YWx1ZSBvbiBJRSA2LTcgc2luY2UgaXQgZG9lc24ndFxuICAgICAgICAvLyBzdXBwb3J0IHRoZSBoYXNoY2hhbmdlIGV2ZW50XG4gICAgICAgIFBPT0xfSU5URVJWQUwgPSAyNSxcblxuICAgICAgICAvLyBsb2NhbCBzdG9yYWdlIGZvciBicmV2aXR5IGFuZCBiZXR0ZXIgY29tcHJlc3Npb24gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuICAgICAgICBkb2N1bWVudCA9IHdpbmRvdy5kb2N1bWVudCxcbiAgICAgICAgaGlzdG9yeSA9IHdpbmRvdy5oaXN0b3J5LFxuICAgICAgICBTaWduYWwgPSBzaWduYWxzLlNpZ25hbCxcblxuICAgICAgICAvLyBsb2NhbCB2YXJzIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuICAgICAgICBoYXNoZXIsXG4gICAgICAgIF9oYXNoLFxuICAgICAgICBfY2hlY2tJbnRlcnZhbCxcbiAgICAgICAgX2lzQWN0aXZlLFxuICAgICAgICBfZnJhbWUsIC8vaWZyYW1lIHVzZWQgZm9yIGxlZ2FjeSBJRSAoNi03KVxuICAgICAgICBfY2hlY2tIaXN0b3J5LFxuICAgICAgICBfaGFzaFZhbFJlZ2V4cCA9IC8jKC4qKSQvLFxuICAgICAgICBfYmFzZVVybFJlZ2V4cCA9IC8oXFw/LiopfChcXCMuKikvLFxuICAgICAgICBfaGFzaFJlZ2V4cCA9IC9eXFwjLyxcblxuICAgICAgICAvLyBzbmlmZmluZy9mZWF0dXJlIGRldGVjdGlvbiAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbiAgICAgICAgLy9oYWNrIGJhc2VkIG9uIHRoaXM6IGh0dHA6Ly93ZWJyZWZsZWN0aW9uLmJsb2dzcG90LmNvbS8yMDA5LzAxLzMyLWJ5dGVzLXRvLWtub3ctaWYteW91ci1icm93c2VyLWlzLWllLmh0bWxcbiAgICAgICAgX2lzSUUgPSAoIStcIlxcdjFcIiksXG4gICAgICAgIC8vIGhhc2hjaGFuZ2UgaXMgc3VwcG9ydGVkIGJ5IEZGMy42KywgSUU4KywgQ2hyb21lIDUrLCBTYWZhcmkgNSsgYnV0XG4gICAgICAgIC8vIGZlYXR1cmUgZGV0ZWN0aW9uIGZhaWxzIG9uIElFIGNvbXBhdGliaWxpdHkgbW9kZSwgc28gd2UgbmVlZCB0b1xuICAgICAgICAvLyBjaGVjayBkb2N1bWVudE1vZGVcbiAgICAgICAgX2lzSGFzaENoYW5nZVN1cHBvcnRlZCA9ICgnb25oYXNoY2hhbmdlJyBpbiB3aW5kb3cpICYmIGRvY3VtZW50LmRvY3VtZW50TW9kZSAhPT0gNyxcbiAgICAgICAgLy9jaGVjayBpZiBpcyBJRTYtNyBzaW5jZSBoYXNoIGNoYW5nZSBpcyBvbmx5IHN1cHBvcnRlZCBvbiBJRTgrIGFuZFxuICAgICAgICAvL2NoYW5naW5nIGhhc2ggdmFsdWUgb24gSUU2LTcgZG9lc24ndCBnZW5lcmF0ZSBoaXN0b3J5IHJlY29yZC5cbiAgICAgICAgX2lzTGVnYWN5SUUgPSBfaXNJRSAmJiAhX2lzSGFzaENoYW5nZVN1cHBvcnRlZCxcbiAgICAgICAgX2lzTG9jYWwgPSAobG9jYXRpb24ucHJvdG9jb2wgPT09ICdmaWxlOicpO1xuXG5cbiAgICAvLy0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgLy8gUHJpdmF0ZSBNZXRob2RzXG4gICAgLy8tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG4gICAgZnVuY3Rpb24gX2VzY2FwZVJlZ0V4cChzdHIpe1xuICAgICAgICByZXR1cm4gU3RyaW5nKHN0ciB8fCAnJykucmVwbGFjZSgvXFxXL2csIFwiXFxcXCQmXCIpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIF90cmltSGFzaChoYXNoKXtcbiAgICAgICAgaWYgKCFoYXNoKSByZXR1cm4gJyc7XG4gICAgICAgIHZhciByZWdleHAgPSBuZXcgUmVnRXhwKCdeJyArIF9lc2NhcGVSZWdFeHAoaGFzaGVyLnByZXBlbmRIYXNoKSArICd8JyArIF9lc2NhcGVSZWdFeHAoaGFzaGVyLmFwcGVuZEhhc2gpICsgJyQnLCAnZycpO1xuICAgICAgICByZXR1cm4gaGFzaC5yZXBsYWNlKHJlZ2V4cCwgJycpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIF9nZXRXaW5kb3dIYXNoKCl7XG4gICAgICAgIC8vcGFyc2VkIGZ1bGwgVVJMIGluc3RlYWQgb2YgZ2V0dGluZyB3aW5kb3cubG9jYXRpb24uaGFzaCBiZWNhdXNlIEZpcmVmb3ggZGVjb2RlIGhhc2ggdmFsdWUgKGFuZCBhbGwgdGhlIG90aGVyIGJyb3dzZXJzIGRvbid0KVxuICAgICAgICAvL2Fsc28gYmVjYXVzZSBvZiBJRTggYnVnIHdpdGggaGFzaCBxdWVyeSBpbiBsb2NhbCBmaWxlIFtpc3N1ZSAjNl1cbiAgICAgICAgdmFyIHJlc3VsdCA9IF9oYXNoVmFsUmVnZXhwLmV4ZWMoIGhhc2hlci5nZXRVUkwoKSApO1xuICAgICAgICB2YXIgcGF0aCA9IChyZXN1bHQgJiYgcmVzdWx0WzFdKSB8fCAnJztcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICByZXR1cm4gaGFzaGVyLnJhdz8gcGF0aCA6IGRlY29kZVVSSUNvbXBvbmVudChwYXRoKTtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgIC8vIGluIGNhc2UgdXNlciBkaWQgbm90IHNldCBgaGFzaGVyLnJhd2AgYW5kIGRlY29kZVVSSUNvbXBvbmVudFxuICAgICAgICAgIC8vIHRocm93cyBhbiBlcnJvciAoc2VlICM1NylcbiAgICAgICAgICByZXR1cm4gcGF0aDtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIF9nZXRGcmFtZUhhc2goKXtcbiAgICAgICAgcmV0dXJuIChfZnJhbWUpPyBfZnJhbWUuY29udGVudFdpbmRvdy5mcmFtZUhhc2ggOiBudWxsO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIF9jcmVhdGVGcmFtZSgpe1xuICAgICAgICBfZnJhbWUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdpZnJhbWUnKTtcbiAgICAgICAgX2ZyYW1lLnNyYyA9ICdhYm91dDpibGFuayc7XG4gICAgICAgIF9mcmFtZS5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuICAgICAgICBkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKF9mcmFtZSk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gX3VwZGF0ZUZyYW1lKCl7XG4gICAgICAgIGlmKF9mcmFtZSAmJiBfaGFzaCAhPT0gX2dldEZyYW1lSGFzaCgpKXtcbiAgICAgICAgICAgIHZhciBmcmFtZURvYyA9IF9mcmFtZS5jb250ZW50V2luZG93LmRvY3VtZW50O1xuICAgICAgICAgICAgZnJhbWVEb2Mub3BlbigpO1xuICAgICAgICAgICAgLy91cGRhdGUgaWZyYW1lIGNvbnRlbnQgdG8gZm9yY2UgbmV3IGhpc3RvcnkgcmVjb3JkLlxuICAgICAgICAgICAgLy9iYXNlZCBvbiBSZWFsbHkgU2ltcGxlIEhpc3RvcnksIFNXRkFkZHJlc3MgYW5kIFlVSS5oaXN0b3J5LlxuICAgICAgICAgICAgZnJhbWVEb2Mud3JpdGUoJzxodG1sPjxoZWFkPjx0aXRsZT4nICsgZG9jdW1lbnQudGl0bGUgKyAnPC90aXRsZT48c2NyaXB0IHR5cGU9XCJ0ZXh0L2phdmFzY3JpcHRcIj52YXIgZnJhbWVIYXNoPVwiJyArIF9oYXNoICsgJ1wiOzwvc2NyaXB0PjwvaGVhZD48Ym9keT4mbmJzcDs8L2JvZHk+PC9odG1sPicpO1xuICAgICAgICAgICAgZnJhbWVEb2MuY2xvc2UoKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIF9yZWdpc3RlckNoYW5nZShuZXdIYXNoLCBpc1JlcGxhY2Upe1xuICAgICAgICBpZihfaGFzaCAhPT0gbmV3SGFzaCl7XG4gICAgICAgICAgICB2YXIgb2xkSGFzaCA9IF9oYXNoO1xuICAgICAgICAgICAgX2hhc2ggPSBuZXdIYXNoOyAvL3Nob3VsZCBjb21lIGJlZm9yZSBldmVudCBkaXNwYXRjaCB0byBtYWtlIHN1cmUgdXNlciBjYW4gZ2V0IHByb3BlciB2YWx1ZSBpbnNpZGUgZXZlbnQgaGFuZGxlclxuICAgICAgICAgICAgaWYoX2lzTGVnYWN5SUUpe1xuICAgICAgICAgICAgICAgIGlmKCFpc1JlcGxhY2Upe1xuICAgICAgICAgICAgICAgICAgICBfdXBkYXRlRnJhbWUoKTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBfZnJhbWUuY29udGVudFdpbmRvdy5mcmFtZUhhc2ggPSBuZXdIYXNoO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGhhc2hlci5jaGFuZ2VkLmRpc3BhdGNoKF90cmltSGFzaChuZXdIYXNoKSwgX3RyaW1IYXNoKG9sZEhhc2gpKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGlmIChfaXNMZWdhY3lJRSkge1xuICAgICAgICAvKipcbiAgICAgICAgICogQHByaXZhdGVcbiAgICAgICAgICovXG4gICAgICAgIF9jaGVja0hpc3RvcnkgPSBmdW5jdGlvbigpe1xuICAgICAgICAgICAgdmFyIHdpbmRvd0hhc2ggPSBfZ2V0V2luZG93SGFzaCgpLFxuICAgICAgICAgICAgICAgIGZyYW1lSGFzaCA9IF9nZXRGcmFtZUhhc2goKTtcbiAgICAgICAgICAgIGlmKGZyYW1lSGFzaCAhPT0gX2hhc2ggJiYgZnJhbWVIYXNoICE9PSB3aW5kb3dIYXNoKXtcbiAgICAgICAgICAgICAgICAvL2RldGVjdCBjaGFuZ2VzIG1hZGUgcHJlc3NpbmcgYnJvd3NlciBoaXN0b3J5IGJ1dHRvbnMuXG4gICAgICAgICAgICAgICAgLy9Xb3JrYXJvdW5kIHNpbmNlIGhpc3RvcnkuYmFjaygpIGFuZCBoaXN0b3J5LmZvcndhcmQoKSBkb2Vzbid0XG4gICAgICAgICAgICAgICAgLy91cGRhdGUgaGFzaCB2YWx1ZSBvbiBJRTYvNyBidXQgdXBkYXRlcyBjb250ZW50IG9mIHRoZSBpZnJhbWUuXG4gICAgICAgICAgICAgICAgLy9uZWVkcyB0byB0cmltIGhhc2ggc2luY2UgdmFsdWUgc3RvcmVkIGFscmVhZHkgaGF2ZVxuICAgICAgICAgICAgICAgIC8vcHJlcGVuZEhhc2ggKyBhcHBlbmRIYXNoIGZvciBmYXN0IGNoZWNrLlxuICAgICAgICAgICAgICAgIGhhc2hlci5zZXRIYXNoKF90cmltSGFzaChmcmFtZUhhc2gpKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAod2luZG93SGFzaCAhPT0gX2hhc2gpe1xuICAgICAgICAgICAgICAgIC8vZGV0ZWN0IGlmIGhhc2ggY2hhbmdlZCAobWFudWFsbHkgb3IgdXNpbmcgc2V0SGFzaClcbiAgICAgICAgICAgICAgICBfcmVnaXN0ZXJDaGFuZ2Uod2luZG93SGFzaCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgfSBlbHNlIHtcbiAgICAgICAgLyoqXG4gICAgICAgICAqIEBwcml2YXRlXG4gICAgICAgICAqL1xuICAgICAgICBfY2hlY2tIaXN0b3J5ID0gZnVuY3Rpb24oKXtcbiAgICAgICAgICAgIHZhciB3aW5kb3dIYXNoID0gX2dldFdpbmRvd0hhc2goKTtcbiAgICAgICAgICAgIGlmKHdpbmRvd0hhc2ggIT09IF9oYXNoKXtcbiAgICAgICAgICAgICAgICBfcmVnaXN0ZXJDaGFuZ2Uod2luZG93SGFzaCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gX2FkZExpc3RlbmVyKGVsbSwgZVR5cGUsIGZuKXtcbiAgICAgICAgaWYoZWxtLmFkZEV2ZW50TGlzdGVuZXIpe1xuICAgICAgICAgICAgZWxtLmFkZEV2ZW50TGlzdGVuZXIoZVR5cGUsIGZuLCBmYWxzZSk7XG4gICAgICAgIH0gZWxzZSBpZiAoZWxtLmF0dGFjaEV2ZW50KXtcbiAgICAgICAgICAgIGVsbS5hdHRhY2hFdmVudCgnb24nICsgZVR5cGUsIGZuKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIF9yZW1vdmVMaXN0ZW5lcihlbG0sIGVUeXBlLCBmbil7XG4gICAgICAgIGlmKGVsbS5yZW1vdmVFdmVudExpc3RlbmVyKXtcbiAgICAgICAgICAgIGVsbS5yZW1vdmVFdmVudExpc3RlbmVyKGVUeXBlLCBmbiwgZmFsc2UpO1xuICAgICAgICB9IGVsc2UgaWYgKGVsbS5kZXRhY2hFdmVudCl7XG4gICAgICAgICAgICBlbG0uZGV0YWNoRXZlbnQoJ29uJyArIGVUeXBlLCBmbik7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiBfbWFrZVBhdGgocGF0aHMpe1xuICAgICAgICBwYXRocyA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cyk7XG5cbiAgICAgICAgdmFyIHBhdGggPSBwYXRocy5qb2luKGhhc2hlci5zZXBhcmF0b3IpO1xuICAgICAgICBwYXRoID0gcGF0aD8gaGFzaGVyLnByZXBlbmRIYXNoICsgcGF0aC5yZXBsYWNlKF9oYXNoUmVnZXhwLCAnJykgKyBoYXNoZXIuYXBwZW5kSGFzaCA6IHBhdGg7XG4gICAgICAgIHJldHVybiBwYXRoO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIF9lbmNvZGVQYXRoKHBhdGgpe1xuICAgICAgICAvL3VzZWQgZW5jb2RlVVJJIGluc3RlYWQgb2YgZW5jb2RlVVJJQ29tcG9uZW50IHRvIHByZXNlcnZlICc/JywgJy8nLFxuICAgICAgICAvLycjJy4gRml4ZXMgU2FmYXJpIGJ1ZyBbaXNzdWUgIzhdXG4gICAgICAgIHBhdGggPSBlbmNvZGVVUkkocGF0aCk7XG4gICAgICAgIGlmKF9pc0lFICYmIF9pc0xvY2FsKXtcbiAgICAgICAgICAgIC8vZml4IElFOCBsb2NhbCBmaWxlIGJ1ZyBbaXNzdWUgIzZdXG4gICAgICAgICAgICBwYXRoID0gcGF0aC5yZXBsYWNlKC9cXD8vLCAnJTNGJyk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHBhdGg7XG4gICAgfVxuXG4gICAgLy8tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIC8vIFB1YmxpYyAoQVBJKVxuICAgIC8vLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuICAgIGhhc2hlciA9IC8qKiBAbGVuZHMgaGFzaGVyICovIHtcblxuICAgICAgICAvKipcbiAgICAgICAgICogaGFzaGVyIFZlcnNpb24gTnVtYmVyXG4gICAgICAgICAqIEB0eXBlIHN0cmluZ1xuICAgICAgICAgKiBAY29uc3RhbnRcbiAgICAgICAgICovXG4gICAgICAgIFZFUlNJT04gOiAnMS4yLjAnLFxuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBCb29sZWFuIGRlY2lkaW5nIGlmIGhhc2hlciBlbmNvZGVzL2RlY29kZXMgdGhlIGhhc2ggb3Igbm90LlxuICAgICAgICAgKiA8dWw+XG4gICAgICAgICAqIDxsaT5kZWZhdWx0IHZhbHVlOiBmYWxzZTs8L2xpPlxuICAgICAgICAgKiA8L3VsPlxuICAgICAgICAgKiBAdHlwZSBib29sZWFuXG4gICAgICAgICAqL1xuICAgICAgICByYXcgOiBmYWxzZSxcblxuICAgICAgICAvKipcbiAgICAgICAgICogU3RyaW5nIHRoYXQgc2hvdWxkIGFsd2F5cyBiZSBhZGRlZCB0byB0aGUgZW5kIG9mIEhhc2ggdmFsdWUuXG4gICAgICAgICAqIDx1bD5cbiAgICAgICAgICogPGxpPmRlZmF1bHQgdmFsdWU6ICcnOzwvbGk+XG4gICAgICAgICAqIDxsaT53aWxsIGJlIGF1dG9tYXRpY2FsbHkgcmVtb3ZlZCBmcm9tIGBoYXNoZXIuZ2V0SGFzaCgpYDwvbGk+XG4gICAgICAgICAqIDxsaT5hdm9pZCBjb25mbGljdHMgd2l0aCBlbGVtZW50cyB0aGF0IGNvbnRhaW4gSUQgZXF1YWwgdG8gaGFzaCB2YWx1ZTs8L2xpPlxuICAgICAgICAgKiA8L3VsPlxuICAgICAgICAgKiBAdHlwZSBzdHJpbmdcbiAgICAgICAgICovXG4gICAgICAgIGFwcGVuZEhhc2ggOiAnJyxcblxuICAgICAgICAvKipcbiAgICAgICAgICogU3RyaW5nIHRoYXQgc2hvdWxkIGFsd2F5cyBiZSBhZGRlZCB0byB0aGUgYmVnaW5uaW5nIG9mIEhhc2ggdmFsdWUuXG4gICAgICAgICAqIDx1bD5cbiAgICAgICAgICogPGxpPmRlZmF1bHQgdmFsdWU6ICcvJzs8L2xpPlxuICAgICAgICAgKiA8bGk+d2lsbCBiZSBhdXRvbWF0aWNhbGx5IHJlbW92ZWQgZnJvbSBgaGFzaGVyLmdldEhhc2goKWA8L2xpPlxuICAgICAgICAgKiA8bGk+YXZvaWQgY29uZmxpY3RzIHdpdGggZWxlbWVudHMgdGhhdCBjb250YWluIElEIGVxdWFsIHRvIGhhc2ggdmFsdWU7PC9saT5cbiAgICAgICAgICogPC91bD5cbiAgICAgICAgICogQHR5cGUgc3RyaW5nXG4gICAgICAgICAqL1xuICAgICAgICBwcmVwZW5kSGFzaCA6ICcvJyxcblxuICAgICAgICAvKipcbiAgICAgICAgICogU3RyaW5nIHVzZWQgdG8gc3BsaXQgaGFzaCBwYXRoczsgdXNlZCBieSBgaGFzaGVyLmdldEhhc2hBc0FycmF5KClgIHRvIHNwbGl0IHBhdGhzLlxuICAgICAgICAgKiA8dWw+XG4gICAgICAgICAqIDxsaT5kZWZhdWx0IHZhbHVlOiAnLyc7PC9saT5cbiAgICAgICAgICogPC91bD5cbiAgICAgICAgICogQHR5cGUgc3RyaW5nXG4gICAgICAgICAqL1xuICAgICAgICBzZXBhcmF0b3IgOiAnLycsXG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIFNpZ25hbCBkaXNwYXRjaGVkIHdoZW4gaGFzaCB2YWx1ZSBjaGFuZ2VzLlxuICAgICAgICAgKiAtIHBhc3MgY3VycmVudCBoYXNoIGFzIDFzdCBwYXJhbWV0ZXIgdG8gbGlzdGVuZXJzIGFuZCBwcmV2aW91cyBoYXNoIHZhbHVlIGFzIDJuZCBwYXJhbWV0ZXIuXG4gICAgICAgICAqIEB0eXBlIHNpZ25hbHMuU2lnbmFsXG4gICAgICAgICAqL1xuICAgICAgICBjaGFuZ2VkIDogbmV3IFNpZ25hbCgpLFxuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBTaWduYWwgZGlzcGF0Y2hlZCB3aGVuIGhhc2hlciBpcyBzdG9wcGVkLlxuICAgICAgICAgKiAtICBwYXNzIGN1cnJlbnQgaGFzaCBhcyBmaXJzdCBwYXJhbWV0ZXIgdG8gbGlzdGVuZXJzXG4gICAgICAgICAqIEB0eXBlIHNpZ25hbHMuU2lnbmFsXG4gICAgICAgICAqL1xuICAgICAgICBzdG9wcGVkIDogbmV3IFNpZ25hbCgpLFxuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBTaWduYWwgZGlzcGF0Y2hlZCB3aGVuIGhhc2hlciBpcyBpbml0aWFsaXplZC5cbiAgICAgICAgICogLSBwYXNzIGN1cnJlbnQgaGFzaCBhcyBmaXJzdCBwYXJhbWV0ZXIgdG8gbGlzdGVuZXJzLlxuICAgICAgICAgKiBAdHlwZSBzaWduYWxzLlNpZ25hbFxuICAgICAgICAgKi9cbiAgICAgICAgaW5pdGlhbGl6ZWQgOiBuZXcgU2lnbmFsKCksXG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIFN0YXJ0IGxpc3RlbmluZy9kaXNwYXRjaGluZyBjaGFuZ2VzIGluIHRoZSBoYXNoL2hpc3RvcnkuXG4gICAgICAgICAqIDx1bD5cbiAgICAgICAgICogICA8bGk+aGFzaGVyIHdvbid0IGRpc3BhdGNoIENIQU5HRSBldmVudHMgYnkgbWFudWFsbHkgdHlwaW5nIGEgbmV3IHZhbHVlIG9yIHByZXNzaW5nIHRoZSBiYWNrL2ZvcndhcmQgYnV0dG9ucyBiZWZvcmUgY2FsbGluZyB0aGlzIG1ldGhvZC48L2xpPlxuICAgICAgICAgKiA8L3VsPlxuICAgICAgICAgKi9cbiAgICAgICAgaW5pdCA6IGZ1bmN0aW9uKCl7XG4gICAgICAgICAgICBpZihfaXNBY3RpdmUpIHJldHVybjtcblxuICAgICAgICAgICAgX2hhc2ggPSBfZ2V0V2luZG93SGFzaCgpO1xuXG4gICAgICAgICAgICAvL3Rob3VnaHQgYWJvdXQgYnJhbmNoaW5nL292ZXJsb2FkaW5nIGhhc2hlci5pbml0KCkgdG8gYXZvaWQgY2hlY2tpbmcgbXVsdGlwbGUgdGltZXMgYnV0XG4gICAgICAgICAgICAvL2Rvbid0IHRoaW5rIHdvcnRoIGRvaW5nIGl0IHNpbmNlIGl0IHByb2JhYmx5IHdvbid0IGJlIGNhbGxlZCBtdWx0aXBsZSB0aW1lcy5cbiAgICAgICAgICAgIGlmKF9pc0hhc2hDaGFuZ2VTdXBwb3J0ZWQpe1xuICAgICAgICAgICAgICAgIF9hZGRMaXN0ZW5lcih3aW5kb3csICdoYXNoY2hhbmdlJywgX2NoZWNrSGlzdG9yeSk7XG4gICAgICAgICAgICB9ZWxzZSB7XG4gICAgICAgICAgICAgICAgaWYoX2lzTGVnYWN5SUUpe1xuICAgICAgICAgICAgICAgICAgICBpZighIF9mcmFtZSl7XG4gICAgICAgICAgICAgICAgICAgICAgICBfY3JlYXRlRnJhbWUoKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBfdXBkYXRlRnJhbWUoKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgX2NoZWNrSW50ZXJ2YWwgPSBzZXRJbnRlcnZhbChfY2hlY2tIaXN0b3J5LCBQT09MX0lOVEVSVkFMKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgX2lzQWN0aXZlID0gdHJ1ZTtcbiAgICAgICAgICAgIGhhc2hlci5pbml0aWFsaXplZC5kaXNwYXRjaChfdHJpbUhhc2goX2hhc2gpKTtcbiAgICAgICAgfSxcblxuICAgICAgICAvKipcbiAgICAgICAgICogU3RvcCBsaXN0ZW5pbmcvZGlzcGF0Y2hpbmcgY2hhbmdlcyBpbiB0aGUgaGFzaC9oaXN0b3J5LlxuICAgICAgICAgKiA8dWw+XG4gICAgICAgICAqICAgPGxpPmhhc2hlciB3b24ndCBkaXNwYXRjaCBDSEFOR0UgZXZlbnRzIGJ5IG1hbnVhbGx5IHR5cGluZyBhIG5ldyB2YWx1ZSBvciBwcmVzc2luZyB0aGUgYmFjay9mb3J3YXJkIGJ1dHRvbnMgYWZ0ZXIgY2FsbGluZyB0aGlzIG1ldGhvZCwgdW5sZXNzIHlvdSBjYWxsIGhhc2hlci5pbml0KCkgYWdhaW4uPC9saT5cbiAgICAgICAgICogICA8bGk+aGFzaGVyIHdpbGwgc3RpbGwgZGlzcGF0Y2ggY2hhbmdlcyBtYWRlIHByb2dyYW1hdGljYWxseSBieSBjYWxsaW5nIGhhc2hlci5zZXRIYXNoKCk7PC9saT5cbiAgICAgICAgICogPC91bD5cbiAgICAgICAgICovXG4gICAgICAgIHN0b3AgOiBmdW5jdGlvbigpe1xuICAgICAgICAgICAgaWYoISBfaXNBY3RpdmUpIHJldHVybjtcblxuICAgICAgICAgICAgaWYoX2lzSGFzaENoYW5nZVN1cHBvcnRlZCl7XG4gICAgICAgICAgICAgICAgX3JlbW92ZUxpc3RlbmVyKHdpbmRvdywgJ2hhc2hjaGFuZ2UnLCBfY2hlY2tIaXN0b3J5KTtcbiAgICAgICAgICAgIH1lbHNle1xuICAgICAgICAgICAgICAgIGNsZWFySW50ZXJ2YWwoX2NoZWNrSW50ZXJ2YWwpO1xuICAgICAgICAgICAgICAgIF9jaGVja0ludGVydmFsID0gbnVsbDtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgX2lzQWN0aXZlID0gZmFsc2U7XG4gICAgICAgICAgICBoYXNoZXIuc3RvcHBlZC5kaXNwYXRjaChfdHJpbUhhc2goX2hhc2gpKTtcbiAgICAgICAgfSxcblxuICAgICAgICAvKipcbiAgICAgICAgICogQHJldHVybiB7Ym9vbGVhbn0gICAgSWYgaGFzaGVyIGlzIGxpc3RlbmluZyB0byBjaGFuZ2VzIG9uIHRoZSBicm93c2VyIGhpc3RvcnkgYW5kL29yIGhhc2ggdmFsdWUuXG4gICAgICAgICAqL1xuICAgICAgICBpc0FjdGl2ZSA6IGZ1bmN0aW9uKCl7XG4gICAgICAgICAgICByZXR1cm4gX2lzQWN0aXZlO1xuICAgICAgICB9LFxuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBAcmV0dXJuIHtzdHJpbmd9IEZ1bGwgVVJMLlxuICAgICAgICAgKi9cbiAgICAgICAgZ2V0VVJMIDogZnVuY3Rpb24oKXtcbiAgICAgICAgICAgIHJldHVybiB3aW5kb3cubG9jYXRpb24uaHJlZjtcbiAgICAgICAgfSxcblxuICAgICAgICAvKipcbiAgICAgICAgICogQHJldHVybiB7c3RyaW5nfSBSZXRyaWV2ZSBVUkwgd2l0aG91dCBxdWVyeSBzdHJpbmcgYW5kIGhhc2guXG4gICAgICAgICAqL1xuICAgICAgICBnZXRCYXNlVVJMIDogZnVuY3Rpb24oKXtcbiAgICAgICAgICAgIHJldHVybiBoYXNoZXIuZ2V0VVJMKCkucmVwbGFjZShfYmFzZVVybFJlZ2V4cCwgJycpOyAvL3JlbW92ZXMgZXZlcnl0aGluZyBhZnRlciAnPycgYW5kL29yICcjJ1xuICAgICAgICB9LFxuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBTZXQgSGFzaCB2YWx1ZSwgZ2VuZXJhdGluZyBhIG5ldyBoaXN0b3J5IHJlY29yZC5cbiAgICAgICAgICogQHBhcmFtIHsuLi5zdHJpbmd9IHBhdGggICAgSGFzaCB2YWx1ZSB3aXRob3V0ICcjJy4gSGFzaGVyIHdpbGwgam9pblxuICAgICAgICAgKiBwYXRoIHNlZ21lbnRzIHVzaW5nIGBoYXNoZXIuc2VwYXJhdG9yYCBhbmQgcHJlcGVuZC9hcHBlbmQgaGFzaCB2YWx1ZVxuICAgICAgICAgKiB3aXRoIGBoYXNoZXIuYXBwZW5kSGFzaGAgYW5kIGBoYXNoZXIucHJlcGVuZEhhc2hgXG4gICAgICAgICAqIEBleGFtcGxlIGhhc2hlci5zZXRIYXNoKCdsb3JlbScsICdpcHN1bScsICdkb2xvcicpIC0+ICcjL2xvcmVtL2lwc3VtL2RvbG9yJ1xuICAgICAgICAgKi9cbiAgICAgICAgc2V0SGFzaCA6IGZ1bmN0aW9uKHBhdGgpe1xuICAgICAgICAgICAgcGF0aCA9IF9tYWtlUGF0aC5hcHBseShudWxsLCBhcmd1bWVudHMpO1xuICAgICAgICAgICAgaWYocGF0aCAhPT0gX2hhc2gpe1xuICAgICAgICAgICAgICAgIC8vIHdlIHNob3VsZCBzdG9yZSByYXcgdmFsdWVcbiAgICAgICAgICAgICAgICBfcmVnaXN0ZXJDaGFuZ2UocGF0aCk7XG4gICAgICAgICAgICAgICAgaWYgKHBhdGggPT09IF9oYXNoKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIHdlIGNoZWNrIGlmIHBhdGggaXMgc3RpbGwgPT09IF9oYXNoIHRvIGF2b2lkIGVycm9yIGluXG4gICAgICAgICAgICAgICAgICAgIC8vIGNhc2Ugb2YgbXVsdGlwbGUgY29uc2VjdXRpdmUgcmVkaXJlY3RzIFtpc3N1ZSAjMzldXG4gICAgICAgICAgICAgICAgICAgIGlmICghIGhhc2hlci5yYXcpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHBhdGggPSBfZW5jb2RlUGF0aChwYXRoKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB3aW5kb3cubG9jYXRpb24uaGFzaCA9ICcjJyArIHBhdGg7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9LFxuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBTZXQgSGFzaCB2YWx1ZSB3aXRob3V0IGtlZXBpbmcgcHJldmlvdXMgaGFzaCBvbiB0aGUgaGlzdG9yeSByZWNvcmQuXG4gICAgICAgICAqIFNpbWlsYXIgdG8gY2FsbGluZyBgd2luZG93LmxvY2F0aW9uLnJlcGxhY2UoXCIjL2hhc2hcIilgIGJ1dCB3aWxsIGFsc28gd29yayBvbiBJRTYtNy5cbiAgICAgICAgICogQHBhcmFtIHsuLi5zdHJpbmd9IHBhdGggICAgSGFzaCB2YWx1ZSB3aXRob3V0ICcjJy4gSGFzaGVyIHdpbGwgam9pblxuICAgICAgICAgKiBwYXRoIHNlZ21lbnRzIHVzaW5nIGBoYXNoZXIuc2VwYXJhdG9yYCBhbmQgcHJlcGVuZC9hcHBlbmQgaGFzaCB2YWx1ZVxuICAgICAgICAgKiB3aXRoIGBoYXNoZXIuYXBwZW5kSGFzaGAgYW5kIGBoYXNoZXIucHJlcGVuZEhhc2hgXG4gICAgICAgICAqIEBleGFtcGxlIGhhc2hlci5yZXBsYWNlSGFzaCgnbG9yZW0nLCAnaXBzdW0nLCAnZG9sb3InKSAtPiAnIy9sb3JlbS9pcHN1bS9kb2xvcidcbiAgICAgICAgICovXG4gICAgICAgIHJlcGxhY2VIYXNoIDogZnVuY3Rpb24ocGF0aCl7XG4gICAgICAgICAgICBwYXRoID0gX21ha2VQYXRoLmFwcGx5KG51bGwsIGFyZ3VtZW50cyk7XG4gICAgICAgICAgICBpZihwYXRoICE9PSBfaGFzaCl7XG4gICAgICAgICAgICAgICAgLy8gd2Ugc2hvdWxkIHN0b3JlIHJhdyB2YWx1ZVxuICAgICAgICAgICAgICAgIF9yZWdpc3RlckNoYW5nZShwYXRoLCB0cnVlKTtcbiAgICAgICAgICAgICAgICBpZiAocGF0aCA9PT0gX2hhc2gpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gd2UgY2hlY2sgaWYgcGF0aCBpcyBzdGlsbCA9PT0gX2hhc2ggdG8gYXZvaWQgZXJyb3IgaW5cbiAgICAgICAgICAgICAgICAgICAgLy8gY2FzZSBvZiBtdWx0aXBsZSBjb25zZWN1dGl2ZSByZWRpcmVjdHMgW2lzc3VlICMzOV1cbiAgICAgICAgICAgICAgICAgICAgaWYgKCEgaGFzaGVyLnJhdykge1xuICAgICAgICAgICAgICAgICAgICAgICAgcGF0aCA9IF9lbmNvZGVQYXRoKHBhdGgpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIHdpbmRvdy5sb2NhdGlvbi5yZXBsYWNlKCcjJyArIHBhdGgpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcblxuICAgICAgICAvKipcbiAgICAgICAgICogQHJldHVybiB7c3RyaW5nfSBIYXNoIHZhbHVlIHdpdGhvdXQgJyMnLCBgaGFzaGVyLmFwcGVuZEhhc2hgIGFuZCBgaGFzaGVyLnByZXBlbmRIYXNoYC5cbiAgICAgICAgICovXG4gICAgICAgIGdldEhhc2ggOiBmdW5jdGlvbigpe1xuICAgICAgICAgICAgLy9kaWRuJ3QgdXNlZCBhY3R1YWwgdmFsdWUgb2YgdGhlIGB3aW5kb3cubG9jYXRpb24uaGFzaGAgdG8gYXZvaWQgYnJlYWtpbmcgdGhlIGFwcGxpY2F0aW9uIGluIGNhc2UgYHdpbmRvdy5sb2NhdGlvbi5oYXNoYCBpc24ndCBhdmFpbGFibGUgYW5kIGFsc28gYmVjYXVzZSB2YWx1ZSBzaG91bGQgYWx3YXlzIGJlIHN5bmNoZWQuXG4gICAgICAgICAgICByZXR1cm4gX3RyaW1IYXNoKF9oYXNoKTtcbiAgICAgICAgfSxcblxuICAgICAgICAvKipcbiAgICAgICAgICogQHJldHVybiB7QXJyYXkuPHN0cmluZz59IEhhc2ggdmFsdWUgc3BsaXQgaW50byBhbiBBcnJheS5cbiAgICAgICAgICovXG4gICAgICAgIGdldEhhc2hBc0FycmF5IDogZnVuY3Rpb24oKXtcbiAgICAgICAgICAgIHJldHVybiBoYXNoZXIuZ2V0SGFzaCgpLnNwbGl0KGhhc2hlci5zZXBhcmF0b3IpO1xuICAgICAgICB9LFxuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBSZW1vdmVzIGFsbCBldmVudCBsaXN0ZW5lcnMsIHN0b3BzIGhhc2hlciBhbmQgZGVzdHJveSBoYXNoZXIgb2JqZWN0LlxuICAgICAgICAgKiAtIElNUE9SVEFOVDogaGFzaGVyIHdvbid0IHdvcmsgYWZ0ZXIgY2FsbGluZyB0aGlzIG1ldGhvZCwgaGFzaGVyIE9iamVjdCB3aWxsIGJlIGRlbGV0ZWQuXG4gICAgICAgICAqL1xuICAgICAgICBkaXNwb3NlIDogZnVuY3Rpb24oKXtcbiAgICAgICAgICAgIGhhc2hlci5zdG9wKCk7XG4gICAgICAgICAgICBoYXNoZXIuaW5pdGlhbGl6ZWQuZGlzcG9zZSgpO1xuICAgICAgICAgICAgaGFzaGVyLnN0b3BwZWQuZGlzcG9zZSgpO1xuICAgICAgICAgICAgaGFzaGVyLmNoYW5nZWQuZGlzcG9zZSgpO1xuICAgICAgICAgICAgX2ZyYW1lID0gaGFzaGVyID0gd2luZG93Lmhhc2hlciA9IG51bGw7XG4gICAgICAgIH0sXG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIEByZXR1cm4ge3N0cmluZ30gQSBzdHJpbmcgcmVwcmVzZW50YXRpb24gb2YgdGhlIG9iamVjdC5cbiAgICAgICAgICovXG4gICAgICAgIHRvU3RyaW5nIDogZnVuY3Rpb24oKXtcbiAgICAgICAgICAgIHJldHVybiAnW2hhc2hlciB2ZXJzaW9uPVwiJysgaGFzaGVyLlZFUlNJT04gKydcIiBoYXNoPVwiJysgaGFzaGVyLmdldEhhc2goKSArJ1wiXSc7XG4gICAgICAgIH1cblxuICAgIH07XG5cbiAgICBoYXNoZXIuaW5pdGlhbGl6ZWQubWVtb3JpemUgPSB0cnVlOyAvL3NlZSAjMzNcblxuICAgIHJldHVybiBoYXNoZXI7XG5cbn0od2luZG93KSk7XG5cblxuICAgIHJldHVybiBoYXNoZXI7XG59O1xuXG5pZiAodHlwZW9mIGRlZmluZSA9PT0gJ2Z1bmN0aW9uJyAmJiBkZWZpbmUuYW1kKSB7XG4gICAgZGVmaW5lKFsnc2lnbmFscyddLCBmYWN0b3J5KTtcbn0gZWxzZSBpZiAodHlwZW9mIGV4cG9ydHMgPT09ICdvYmplY3QnKSB7XG4gICAgbW9kdWxlLmV4cG9ydHMgPSBmYWN0b3J5KHJlcXVpcmUoJ3NpZ25hbHMnKSk7XG59IGVsc2Uge1xuICAgIC8qanNoaW50IHN1Yjp0cnVlICovXG4gICAgd2luZG93WydoYXNoZXInXSA9IGZhY3Rvcnkod2luZG93WydzaWduYWxzJ10pO1xufVxuXG59KCkpO1xuIiwiLypqc2xpbnQgb25ldmFyOnRydWUsIHVuZGVmOnRydWUsIG5ld2NhcDp0cnVlLCByZWdleHA6dHJ1ZSwgYml0d2lzZTp0cnVlLCBtYXhlcnI6NTAsIGluZGVudDo0LCB3aGl0ZTpmYWxzZSwgbm9tZW46ZmFsc2UsIHBsdXNwbHVzOmZhbHNlICovXG4vKmdsb2JhbCBkZWZpbmU6ZmFsc2UsIHJlcXVpcmU6ZmFsc2UsIGV4cG9ydHM6ZmFsc2UsIG1vZHVsZTpmYWxzZSwgc2lnbmFsczpmYWxzZSAqL1xuXG4vKiogQGxpY2Vuc2VcbiAqIEpTIFNpZ25hbHMgPGh0dHA6Ly9taWxsZXJtZWRlaXJvcy5naXRodWIuY29tL2pzLXNpZ25hbHMvPlxuICogUmVsZWFzZWQgdW5kZXIgdGhlIE1JVCBsaWNlbnNlXG4gKiBBdXRob3I6IE1pbGxlciBNZWRlaXJvc1xuICogVmVyc2lvbjogMS4wLjAgLSBCdWlsZDogMjY4ICgyMDEyLzExLzI5IDA1OjQ4IFBNKVxuICovXG5cbihmdW5jdGlvbihnbG9iYWwpe1xuXG4gICAgLy8gU2lnbmFsQmluZGluZyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgLy89PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbiAgICAvKipcbiAgICAgKiBPYmplY3QgdGhhdCByZXByZXNlbnRzIGEgYmluZGluZyBiZXR3ZWVuIGEgU2lnbmFsIGFuZCBhIGxpc3RlbmVyIGZ1bmN0aW9uLlxuICAgICAqIDxiciAvPi0gPHN0cm9uZz5UaGlzIGlzIGFuIGludGVybmFsIGNvbnN0cnVjdG9yIGFuZCBzaG91bGRuJ3QgYmUgY2FsbGVkIGJ5IHJlZ3VsYXIgdXNlcnMuPC9zdHJvbmc+XG4gICAgICogPGJyIC8+LSBpbnNwaXJlZCBieSBKb2EgRWJlcnQgQVMzIFNpZ25hbEJpbmRpbmcgYW5kIFJvYmVydCBQZW5uZXIncyBTbG90IGNsYXNzZXMuXG4gICAgICogQGF1dGhvciBNaWxsZXIgTWVkZWlyb3NcbiAgICAgKiBAY29uc3RydWN0b3JcbiAgICAgKiBAaW50ZXJuYWxcbiAgICAgKiBAbmFtZSBTaWduYWxCaW5kaW5nXG4gICAgICogQHBhcmFtIHtTaWduYWx9IHNpZ25hbCBSZWZlcmVuY2UgdG8gU2lnbmFsIG9iamVjdCB0aGF0IGxpc3RlbmVyIGlzIGN1cnJlbnRseSBib3VuZCB0by5cbiAgICAgKiBAcGFyYW0ge0Z1bmN0aW9ufSBsaXN0ZW5lciBIYW5kbGVyIGZ1bmN0aW9uIGJvdW5kIHRvIHRoZSBzaWduYWwuXG4gICAgICogQHBhcmFtIHtib29sZWFufSBpc09uY2UgSWYgYmluZGluZyBzaG91bGQgYmUgZXhlY3V0ZWQganVzdCBvbmNlLlxuICAgICAqIEBwYXJhbSB7T2JqZWN0fSBbbGlzdGVuZXJDb250ZXh0XSBDb250ZXh0IG9uIHdoaWNoIGxpc3RlbmVyIHdpbGwgYmUgZXhlY3V0ZWQgKG9iamVjdCB0aGF0IHNob3VsZCByZXByZXNlbnQgdGhlIGB0aGlzYCB2YXJpYWJsZSBpbnNpZGUgbGlzdGVuZXIgZnVuY3Rpb24pLlxuICAgICAqIEBwYXJhbSB7TnVtYmVyfSBbcHJpb3JpdHldIFRoZSBwcmlvcml0eSBsZXZlbCBvZiB0aGUgZXZlbnQgbGlzdGVuZXIuIChkZWZhdWx0ID0gMCkuXG4gICAgICovXG4gICAgZnVuY3Rpb24gU2lnbmFsQmluZGluZyhzaWduYWwsIGxpc3RlbmVyLCBpc09uY2UsIGxpc3RlbmVyQ29udGV4dCwgcHJpb3JpdHkpIHtcblxuICAgICAgICAvKipcbiAgICAgICAgICogSGFuZGxlciBmdW5jdGlvbiBib3VuZCB0byB0aGUgc2lnbmFsLlxuICAgICAgICAgKiBAdHlwZSBGdW5jdGlvblxuICAgICAgICAgKiBAcHJpdmF0ZVxuICAgICAgICAgKi9cbiAgICAgICAgdGhpcy5fbGlzdGVuZXIgPSBsaXN0ZW5lcjtcblxuICAgICAgICAvKipcbiAgICAgICAgICogSWYgYmluZGluZyBzaG91bGQgYmUgZXhlY3V0ZWQganVzdCBvbmNlLlxuICAgICAgICAgKiBAdHlwZSBib29sZWFuXG4gICAgICAgICAqIEBwcml2YXRlXG4gICAgICAgICAqL1xuICAgICAgICB0aGlzLl9pc09uY2UgPSBpc09uY2U7XG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIENvbnRleHQgb24gd2hpY2ggbGlzdGVuZXIgd2lsbCBiZSBleGVjdXRlZCAob2JqZWN0IHRoYXQgc2hvdWxkIHJlcHJlc2VudCB0aGUgYHRoaXNgIHZhcmlhYmxlIGluc2lkZSBsaXN0ZW5lciBmdW5jdGlvbikuXG4gICAgICAgICAqIEBtZW1iZXJPZiBTaWduYWxCaW5kaW5nLnByb3RvdHlwZVxuICAgICAgICAgKiBAbmFtZSBjb250ZXh0XG4gICAgICAgICAqIEB0eXBlIE9iamVjdHx1bmRlZmluZWR8bnVsbFxuICAgICAgICAgKi9cbiAgICAgICAgdGhpcy5jb250ZXh0ID0gbGlzdGVuZXJDb250ZXh0O1xuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBSZWZlcmVuY2UgdG8gU2lnbmFsIG9iamVjdCB0aGF0IGxpc3RlbmVyIGlzIGN1cnJlbnRseSBib3VuZCB0by5cbiAgICAgICAgICogQHR5cGUgU2lnbmFsXG4gICAgICAgICAqIEBwcml2YXRlXG4gICAgICAgICAqL1xuICAgICAgICB0aGlzLl9zaWduYWwgPSBzaWduYWw7XG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIExpc3RlbmVyIHByaW9yaXR5XG4gICAgICAgICAqIEB0eXBlIE51bWJlclxuICAgICAgICAgKiBAcHJpdmF0ZVxuICAgICAgICAgKi9cbiAgICAgICAgdGhpcy5fcHJpb3JpdHkgPSBwcmlvcml0eSB8fCAwO1xuICAgIH1cblxuICAgIFNpZ25hbEJpbmRpbmcucHJvdG90eXBlID0ge1xuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBJZiBiaW5kaW5nIGlzIGFjdGl2ZSBhbmQgc2hvdWxkIGJlIGV4ZWN1dGVkLlxuICAgICAgICAgKiBAdHlwZSBib29sZWFuXG4gICAgICAgICAqL1xuICAgICAgICBhY3RpdmUgOiB0cnVlLFxuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBEZWZhdWx0IHBhcmFtZXRlcnMgcGFzc2VkIHRvIGxpc3RlbmVyIGR1cmluZyBgU2lnbmFsLmRpc3BhdGNoYCBhbmQgYFNpZ25hbEJpbmRpbmcuZXhlY3V0ZWAuIChjdXJyaWVkIHBhcmFtZXRlcnMpXG4gICAgICAgICAqIEB0eXBlIEFycmF5fG51bGxcbiAgICAgICAgICovXG4gICAgICAgIHBhcmFtcyA6IG51bGwsXG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIENhbGwgbGlzdGVuZXIgcGFzc2luZyBhcmJpdHJhcnkgcGFyYW1ldGVycy5cbiAgICAgICAgICogPHA+SWYgYmluZGluZyB3YXMgYWRkZWQgdXNpbmcgYFNpZ25hbC5hZGRPbmNlKClgIGl0IHdpbGwgYmUgYXV0b21hdGljYWxseSByZW1vdmVkIGZyb20gc2lnbmFsIGRpc3BhdGNoIHF1ZXVlLCB0aGlzIG1ldGhvZCBpcyB1c2VkIGludGVybmFsbHkgZm9yIHRoZSBzaWduYWwgZGlzcGF0Y2guPC9wPlxuICAgICAgICAgKiBAcGFyYW0ge0FycmF5fSBbcGFyYW1zQXJyXSBBcnJheSBvZiBwYXJhbWV0ZXJzIHRoYXQgc2hvdWxkIGJlIHBhc3NlZCB0byB0aGUgbGlzdGVuZXJcbiAgICAgICAgICogQHJldHVybiB7Kn0gVmFsdWUgcmV0dXJuZWQgYnkgdGhlIGxpc3RlbmVyLlxuICAgICAgICAgKi9cbiAgICAgICAgZXhlY3V0ZSA6IGZ1bmN0aW9uIChwYXJhbXNBcnIpIHtcbiAgICAgICAgICAgIHZhciBoYW5kbGVyUmV0dXJuLCBwYXJhbXM7XG4gICAgICAgICAgICBpZiAodGhpcy5hY3RpdmUgJiYgISF0aGlzLl9saXN0ZW5lcikge1xuICAgICAgICAgICAgICAgIHBhcmFtcyA9IHRoaXMucGFyYW1zPyB0aGlzLnBhcmFtcy5jb25jYXQocGFyYW1zQXJyKSA6IHBhcmFtc0FycjtcbiAgICAgICAgICAgICAgICBoYW5kbGVyUmV0dXJuID0gdGhpcy5fbGlzdGVuZXIuYXBwbHkodGhpcy5jb250ZXh0LCBwYXJhbXMpO1xuICAgICAgICAgICAgICAgIGlmICh0aGlzLl9pc09uY2UpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5kZXRhY2goKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gaGFuZGxlclJldHVybjtcbiAgICAgICAgfSxcblxuICAgICAgICAvKipcbiAgICAgICAgICogRGV0YWNoIGJpbmRpbmcgZnJvbSBzaWduYWwuXG4gICAgICAgICAqIC0gYWxpYXMgdG86IG15U2lnbmFsLnJlbW92ZShteUJpbmRpbmcuZ2V0TGlzdGVuZXIoKSk7XG4gICAgICAgICAqIEByZXR1cm4ge0Z1bmN0aW9ufG51bGx9IEhhbmRsZXIgZnVuY3Rpb24gYm91bmQgdG8gdGhlIHNpZ25hbCBvciBgbnVsbGAgaWYgYmluZGluZyB3YXMgcHJldmlvdXNseSBkZXRhY2hlZC5cbiAgICAgICAgICovXG4gICAgICAgIGRldGFjaCA6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLmlzQm91bmQoKT8gdGhpcy5fc2lnbmFsLnJlbW92ZSh0aGlzLl9saXN0ZW5lciwgdGhpcy5jb250ZXh0KSA6IG51bGw7XG4gICAgICAgIH0sXG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIEByZXR1cm4ge0Jvb2xlYW59IGB0cnVlYCBpZiBiaW5kaW5nIGlzIHN0aWxsIGJvdW5kIHRvIHRoZSBzaWduYWwgYW5kIGhhdmUgYSBsaXN0ZW5lci5cbiAgICAgICAgICovXG4gICAgICAgIGlzQm91bmQgOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICByZXR1cm4gKCEhdGhpcy5fc2lnbmFsICYmICEhdGhpcy5fbGlzdGVuZXIpO1xuICAgICAgICB9LFxuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBAcmV0dXJuIHtib29sZWFufSBJZiBTaWduYWxCaW5kaW5nIHdpbGwgb25seSBiZSBleGVjdXRlZCBvbmNlLlxuICAgICAgICAgKi9cbiAgICAgICAgaXNPbmNlIDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuX2lzT25jZTtcbiAgICAgICAgfSxcblxuICAgICAgICAvKipcbiAgICAgICAgICogQHJldHVybiB7RnVuY3Rpb259IEhhbmRsZXIgZnVuY3Rpb24gYm91bmQgdG8gdGhlIHNpZ25hbC5cbiAgICAgICAgICovXG4gICAgICAgIGdldExpc3RlbmVyIDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuX2xpc3RlbmVyO1xuICAgICAgICB9LFxuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBAcmV0dXJuIHtTaWduYWx9IFNpZ25hbCB0aGF0IGxpc3RlbmVyIGlzIGN1cnJlbnRseSBib3VuZCB0by5cbiAgICAgICAgICovXG4gICAgICAgIGdldFNpZ25hbCA6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl9zaWduYWw7XG4gICAgICAgIH0sXG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIERlbGV0ZSBpbnN0YW5jZSBwcm9wZXJ0aWVzXG4gICAgICAgICAqIEBwcml2YXRlXG4gICAgICAgICAqL1xuICAgICAgICBfZGVzdHJveSA6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIGRlbGV0ZSB0aGlzLl9zaWduYWw7XG4gICAgICAgICAgICBkZWxldGUgdGhpcy5fbGlzdGVuZXI7XG4gICAgICAgICAgICBkZWxldGUgdGhpcy5jb250ZXh0O1xuICAgICAgICB9LFxuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBAcmV0dXJuIHtzdHJpbmd9IFN0cmluZyByZXByZXNlbnRhdGlvbiBvZiB0aGUgb2JqZWN0LlxuICAgICAgICAgKi9cbiAgICAgICAgdG9TdHJpbmcgOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICByZXR1cm4gJ1tTaWduYWxCaW5kaW5nIGlzT25jZTonICsgdGhpcy5faXNPbmNlICsnLCBpc0JvdW5kOicrIHRoaXMuaXNCb3VuZCgpICsnLCBhY3RpdmU6JyArIHRoaXMuYWN0aXZlICsgJ10nO1xuICAgICAgICB9XG5cbiAgICB9O1xuXG5cbi8qZ2xvYmFsIFNpZ25hbEJpbmRpbmc6ZmFsc2UqL1xuXG4gICAgLy8gU2lnbmFsIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgLy89PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbiAgICBmdW5jdGlvbiB2YWxpZGF0ZUxpc3RlbmVyKGxpc3RlbmVyLCBmbk5hbWUpIHtcbiAgICAgICAgaWYgKHR5cGVvZiBsaXN0ZW5lciAhPT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCAnbGlzdGVuZXIgaXMgYSByZXF1aXJlZCBwYXJhbSBvZiB7Zm59KCkgYW5kIHNob3VsZCBiZSBhIEZ1bmN0aW9uLicucmVwbGFjZSgne2ZufScsIGZuTmFtZSkgKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEN1c3RvbSBldmVudCBicm9hZGNhc3RlclxuICAgICAqIDxiciAvPi0gaW5zcGlyZWQgYnkgUm9iZXJ0IFBlbm5lcidzIEFTMyBTaWduYWxzLlxuICAgICAqIEBuYW1lIFNpZ25hbFxuICAgICAqIEBhdXRob3IgTWlsbGVyIE1lZGVpcm9zXG4gICAgICogQGNvbnN0cnVjdG9yXG4gICAgICovXG4gICAgZnVuY3Rpb24gU2lnbmFsKCkge1xuICAgICAgICAvKipcbiAgICAgICAgICogQHR5cGUgQXJyYXkuPFNpZ25hbEJpbmRpbmc+XG4gICAgICAgICAqIEBwcml2YXRlXG4gICAgICAgICAqL1xuICAgICAgICB0aGlzLl9iaW5kaW5ncyA9IFtdO1xuICAgICAgICB0aGlzLl9wcmV2UGFyYW1zID0gbnVsbDtcblxuICAgICAgICAvLyBlbmZvcmNlIGRpc3BhdGNoIHRvIGF3YXlzIHdvcmsgb24gc2FtZSBjb250ZXh0ICgjNDcpXG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgdGhpcy5kaXNwYXRjaCA9IGZ1bmN0aW9uKCl7XG4gICAgICAgICAgICBTaWduYWwucHJvdG90eXBlLmRpc3BhdGNoLmFwcGx5KHNlbGYsIGFyZ3VtZW50cyk7XG4gICAgICAgIH07XG4gICAgfVxuXG4gICAgU2lnbmFsLnByb3RvdHlwZSA9IHtcblxuICAgICAgICAvKipcbiAgICAgICAgICogU2lnbmFscyBWZXJzaW9uIE51bWJlclxuICAgICAgICAgKiBAdHlwZSBTdHJpbmdcbiAgICAgICAgICogQGNvbnN0XG4gICAgICAgICAqL1xuICAgICAgICBWRVJTSU9OIDogJzEuMC4wJyxcblxuICAgICAgICAvKipcbiAgICAgICAgICogSWYgU2lnbmFsIHNob3VsZCBrZWVwIHJlY29yZCBvZiBwcmV2aW91c2x5IGRpc3BhdGNoZWQgcGFyYW1ldGVycyBhbmRcbiAgICAgICAgICogYXV0b21hdGljYWxseSBleGVjdXRlIGxpc3RlbmVyIGR1cmluZyBgYWRkKClgL2BhZGRPbmNlKClgIGlmIFNpZ25hbCB3YXNcbiAgICAgICAgICogYWxyZWFkeSBkaXNwYXRjaGVkIGJlZm9yZS5cbiAgICAgICAgICogQHR5cGUgYm9vbGVhblxuICAgICAgICAgKi9cbiAgICAgICAgbWVtb3JpemUgOiBmYWxzZSxcblxuICAgICAgICAvKipcbiAgICAgICAgICogQHR5cGUgYm9vbGVhblxuICAgICAgICAgKiBAcHJpdmF0ZVxuICAgICAgICAgKi9cbiAgICAgICAgX3Nob3VsZFByb3BhZ2F0ZSA6IHRydWUsXG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIElmIFNpZ25hbCBpcyBhY3RpdmUgYW5kIHNob3VsZCBicm9hZGNhc3QgZXZlbnRzLlxuICAgICAgICAgKiA8cD48c3Ryb25nPklNUE9SVEFOVDo8L3N0cm9uZz4gU2V0dGluZyB0aGlzIHByb3BlcnR5IGR1cmluZyBhIGRpc3BhdGNoIHdpbGwgb25seSBhZmZlY3QgdGhlIG5leHQgZGlzcGF0Y2gsIGlmIHlvdSB3YW50IHRvIHN0b3AgdGhlIHByb3BhZ2F0aW9uIG9mIGEgc2lnbmFsIHVzZSBgaGFsdCgpYCBpbnN0ZWFkLjwvcD5cbiAgICAgICAgICogQHR5cGUgYm9vbGVhblxuICAgICAgICAgKi9cbiAgICAgICAgYWN0aXZlIDogdHJ1ZSxcblxuICAgICAgICAvKipcbiAgICAgICAgICogQHBhcmFtIHtGdW5jdGlvbn0gbGlzdGVuZXJcbiAgICAgICAgICogQHBhcmFtIHtib29sZWFufSBpc09uY2VcbiAgICAgICAgICogQHBhcmFtIHtPYmplY3R9IFtsaXN0ZW5lckNvbnRleHRdXG4gICAgICAgICAqIEBwYXJhbSB7TnVtYmVyfSBbcHJpb3JpdHldXG4gICAgICAgICAqIEByZXR1cm4ge1NpZ25hbEJpbmRpbmd9XG4gICAgICAgICAqIEBwcml2YXRlXG4gICAgICAgICAqL1xuICAgICAgICBfcmVnaXN0ZXJMaXN0ZW5lciA6IGZ1bmN0aW9uIChsaXN0ZW5lciwgaXNPbmNlLCBsaXN0ZW5lckNvbnRleHQsIHByaW9yaXR5KSB7XG5cbiAgICAgICAgICAgIHZhciBwcmV2SW5kZXggPSB0aGlzLl9pbmRleE9mTGlzdGVuZXIobGlzdGVuZXIsIGxpc3RlbmVyQ29udGV4dCksXG4gICAgICAgICAgICAgICAgYmluZGluZztcblxuICAgICAgICAgICAgaWYgKHByZXZJbmRleCAhPT0gLTEpIHtcbiAgICAgICAgICAgICAgICBiaW5kaW5nID0gdGhpcy5fYmluZGluZ3NbcHJldkluZGV4XTtcbiAgICAgICAgICAgICAgICBpZiAoYmluZGluZy5pc09uY2UoKSAhPT0gaXNPbmNlKSB7XG4gICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignWW91IGNhbm5vdCBhZGQnKyAoaXNPbmNlPyAnJyA6ICdPbmNlJykgKycoKSB0aGVuIGFkZCcrICghaXNPbmNlPyAnJyA6ICdPbmNlJykgKycoKSB0aGUgc2FtZSBsaXN0ZW5lciB3aXRob3V0IHJlbW92aW5nIHRoZSByZWxhdGlvbnNoaXAgZmlyc3QuJyk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBiaW5kaW5nID0gbmV3IFNpZ25hbEJpbmRpbmcodGhpcywgbGlzdGVuZXIsIGlzT25jZSwgbGlzdGVuZXJDb250ZXh0LCBwcmlvcml0eSk7XG4gICAgICAgICAgICAgICAgdGhpcy5fYWRkQmluZGluZyhiaW5kaW5nKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYodGhpcy5tZW1vcml6ZSAmJiB0aGlzLl9wcmV2UGFyYW1zKXtcbiAgICAgICAgICAgICAgICBiaW5kaW5nLmV4ZWN1dGUodGhpcy5fcHJldlBhcmFtcyk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiBiaW5kaW5nO1xuICAgICAgICB9LFxuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBAcGFyYW0ge1NpZ25hbEJpbmRpbmd9IGJpbmRpbmdcbiAgICAgICAgICogQHByaXZhdGVcbiAgICAgICAgICovXG4gICAgICAgIF9hZGRCaW5kaW5nIDogZnVuY3Rpb24gKGJpbmRpbmcpIHtcbiAgICAgICAgICAgIC8vc2ltcGxpZmllZCBpbnNlcnRpb24gc29ydFxuICAgICAgICAgICAgdmFyIG4gPSB0aGlzLl9iaW5kaW5ncy5sZW5ndGg7XG4gICAgICAgICAgICBkbyB7IC0tbjsgfSB3aGlsZSAodGhpcy5fYmluZGluZ3Nbbl0gJiYgYmluZGluZy5fcHJpb3JpdHkgPD0gdGhpcy5fYmluZGluZ3Nbbl0uX3ByaW9yaXR5KTtcbiAgICAgICAgICAgIHRoaXMuX2JpbmRpbmdzLnNwbGljZShuICsgMSwgMCwgYmluZGluZyk7XG4gICAgICAgIH0sXG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIEBwYXJhbSB7RnVuY3Rpb259IGxpc3RlbmVyXG4gICAgICAgICAqIEByZXR1cm4ge251bWJlcn1cbiAgICAgICAgICogQHByaXZhdGVcbiAgICAgICAgICovXG4gICAgICAgIF9pbmRleE9mTGlzdGVuZXIgOiBmdW5jdGlvbiAobGlzdGVuZXIsIGNvbnRleHQpIHtcbiAgICAgICAgICAgIHZhciBuID0gdGhpcy5fYmluZGluZ3MubGVuZ3RoLFxuICAgICAgICAgICAgICAgIGN1cjtcbiAgICAgICAgICAgIHdoaWxlIChuLS0pIHtcbiAgICAgICAgICAgICAgICBjdXIgPSB0aGlzLl9iaW5kaW5nc1tuXTtcbiAgICAgICAgICAgICAgICBpZiAoY3VyLl9saXN0ZW5lciA9PT0gbGlzdGVuZXIgJiYgY3VyLmNvbnRleHQgPT09IGNvbnRleHQpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIG47XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIC0xO1xuICAgICAgICB9LFxuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBDaGVjayBpZiBsaXN0ZW5lciB3YXMgYXR0YWNoZWQgdG8gU2lnbmFsLlxuICAgICAgICAgKiBAcGFyYW0ge0Z1bmN0aW9ufSBsaXN0ZW5lclxuICAgICAgICAgKiBAcGFyYW0ge09iamVjdH0gW2NvbnRleHRdXG4gICAgICAgICAqIEByZXR1cm4ge2Jvb2xlYW59IGlmIFNpZ25hbCBoYXMgdGhlIHNwZWNpZmllZCBsaXN0ZW5lci5cbiAgICAgICAgICovXG4gICAgICAgIGhhcyA6IGZ1bmN0aW9uIChsaXN0ZW5lciwgY29udGV4dCkge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuX2luZGV4T2ZMaXN0ZW5lcihsaXN0ZW5lciwgY29udGV4dCkgIT09IC0xO1xuICAgICAgICB9LFxuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBBZGQgYSBsaXN0ZW5lciB0byB0aGUgc2lnbmFsLlxuICAgICAgICAgKiBAcGFyYW0ge0Z1bmN0aW9ufSBsaXN0ZW5lciBTaWduYWwgaGFuZGxlciBmdW5jdGlvbi5cbiAgICAgICAgICogQHBhcmFtIHtPYmplY3R9IFtsaXN0ZW5lckNvbnRleHRdIENvbnRleHQgb24gd2hpY2ggbGlzdGVuZXIgd2lsbCBiZSBleGVjdXRlZCAob2JqZWN0IHRoYXQgc2hvdWxkIHJlcHJlc2VudCB0aGUgYHRoaXNgIHZhcmlhYmxlIGluc2lkZSBsaXN0ZW5lciBmdW5jdGlvbikuXG4gICAgICAgICAqIEBwYXJhbSB7TnVtYmVyfSBbcHJpb3JpdHldIFRoZSBwcmlvcml0eSBsZXZlbCBvZiB0aGUgZXZlbnQgbGlzdGVuZXIuIExpc3RlbmVycyB3aXRoIGhpZ2hlciBwcmlvcml0eSB3aWxsIGJlIGV4ZWN1dGVkIGJlZm9yZSBsaXN0ZW5lcnMgd2l0aCBsb3dlciBwcmlvcml0eS4gTGlzdGVuZXJzIHdpdGggc2FtZSBwcmlvcml0eSBsZXZlbCB3aWxsIGJlIGV4ZWN1dGVkIGF0IHRoZSBzYW1lIG9yZGVyIGFzIHRoZXkgd2VyZSBhZGRlZC4gKGRlZmF1bHQgPSAwKVxuICAgICAgICAgKiBAcmV0dXJuIHtTaWduYWxCaW5kaW5nfSBBbiBPYmplY3QgcmVwcmVzZW50aW5nIHRoZSBiaW5kaW5nIGJldHdlZW4gdGhlIFNpZ25hbCBhbmQgbGlzdGVuZXIuXG4gICAgICAgICAqL1xuICAgICAgICBhZGQgOiBmdW5jdGlvbiAobGlzdGVuZXIsIGxpc3RlbmVyQ29udGV4dCwgcHJpb3JpdHkpIHtcbiAgICAgICAgICAgIHZhbGlkYXRlTGlzdGVuZXIobGlzdGVuZXIsICdhZGQnKTtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl9yZWdpc3Rlckxpc3RlbmVyKGxpc3RlbmVyLCBmYWxzZSwgbGlzdGVuZXJDb250ZXh0LCBwcmlvcml0eSk7XG4gICAgICAgIH0sXG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIEFkZCBsaXN0ZW5lciB0byB0aGUgc2lnbmFsIHRoYXQgc2hvdWxkIGJlIHJlbW92ZWQgYWZ0ZXIgZmlyc3QgZXhlY3V0aW9uICh3aWxsIGJlIGV4ZWN1dGVkIG9ubHkgb25jZSkuXG4gICAgICAgICAqIEBwYXJhbSB7RnVuY3Rpb259IGxpc3RlbmVyIFNpZ25hbCBoYW5kbGVyIGZ1bmN0aW9uLlxuICAgICAgICAgKiBAcGFyYW0ge09iamVjdH0gW2xpc3RlbmVyQ29udGV4dF0gQ29udGV4dCBvbiB3aGljaCBsaXN0ZW5lciB3aWxsIGJlIGV4ZWN1dGVkIChvYmplY3QgdGhhdCBzaG91bGQgcmVwcmVzZW50IHRoZSBgdGhpc2AgdmFyaWFibGUgaW5zaWRlIGxpc3RlbmVyIGZ1bmN0aW9uKS5cbiAgICAgICAgICogQHBhcmFtIHtOdW1iZXJ9IFtwcmlvcml0eV0gVGhlIHByaW9yaXR5IGxldmVsIG9mIHRoZSBldmVudCBsaXN0ZW5lci4gTGlzdGVuZXJzIHdpdGggaGlnaGVyIHByaW9yaXR5IHdpbGwgYmUgZXhlY3V0ZWQgYmVmb3JlIGxpc3RlbmVycyB3aXRoIGxvd2VyIHByaW9yaXR5LiBMaXN0ZW5lcnMgd2l0aCBzYW1lIHByaW9yaXR5IGxldmVsIHdpbGwgYmUgZXhlY3V0ZWQgYXQgdGhlIHNhbWUgb3JkZXIgYXMgdGhleSB3ZXJlIGFkZGVkLiAoZGVmYXVsdCA9IDApXG4gICAgICAgICAqIEByZXR1cm4ge1NpZ25hbEJpbmRpbmd9IEFuIE9iamVjdCByZXByZXNlbnRpbmcgdGhlIGJpbmRpbmcgYmV0d2VlbiB0aGUgU2lnbmFsIGFuZCBsaXN0ZW5lci5cbiAgICAgICAgICovXG4gICAgICAgIGFkZE9uY2UgOiBmdW5jdGlvbiAobGlzdGVuZXIsIGxpc3RlbmVyQ29udGV4dCwgcHJpb3JpdHkpIHtcbiAgICAgICAgICAgIHZhbGlkYXRlTGlzdGVuZXIobGlzdGVuZXIsICdhZGRPbmNlJyk7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5fcmVnaXN0ZXJMaXN0ZW5lcihsaXN0ZW5lciwgdHJ1ZSwgbGlzdGVuZXJDb250ZXh0LCBwcmlvcml0eSk7XG4gICAgICAgIH0sXG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIFJlbW92ZSBhIHNpbmdsZSBsaXN0ZW5lciBmcm9tIHRoZSBkaXNwYXRjaCBxdWV1ZS5cbiAgICAgICAgICogQHBhcmFtIHtGdW5jdGlvbn0gbGlzdGVuZXIgSGFuZGxlciBmdW5jdGlvbiB0aGF0IHNob3VsZCBiZSByZW1vdmVkLlxuICAgICAgICAgKiBAcGFyYW0ge09iamVjdH0gW2NvbnRleHRdIEV4ZWN1dGlvbiBjb250ZXh0IChzaW5jZSB5b3UgY2FuIGFkZCB0aGUgc2FtZSBoYW5kbGVyIG11bHRpcGxlIHRpbWVzIGlmIGV4ZWN1dGluZyBpbiBhIGRpZmZlcmVudCBjb250ZXh0KS5cbiAgICAgICAgICogQHJldHVybiB7RnVuY3Rpb259IExpc3RlbmVyIGhhbmRsZXIgZnVuY3Rpb24uXG4gICAgICAgICAqL1xuICAgICAgICByZW1vdmUgOiBmdW5jdGlvbiAobGlzdGVuZXIsIGNvbnRleHQpIHtcbiAgICAgICAgICAgIHZhbGlkYXRlTGlzdGVuZXIobGlzdGVuZXIsICdyZW1vdmUnKTtcblxuICAgICAgICAgICAgdmFyIGkgPSB0aGlzLl9pbmRleE9mTGlzdGVuZXIobGlzdGVuZXIsIGNvbnRleHQpO1xuICAgICAgICAgICAgaWYgKGkgIT09IC0xKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5fYmluZGluZ3NbaV0uX2Rlc3Ryb3koKTsgLy9ubyByZWFzb24gdG8gYSBTaWduYWxCaW5kaW5nIGV4aXN0IGlmIGl0IGlzbid0IGF0dGFjaGVkIHRvIGEgc2lnbmFsXG4gICAgICAgICAgICAgICAgdGhpcy5fYmluZGluZ3Muc3BsaWNlKGksIDEpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIGxpc3RlbmVyO1xuICAgICAgICB9LFxuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBSZW1vdmUgYWxsIGxpc3RlbmVycyBmcm9tIHRoZSBTaWduYWwuXG4gICAgICAgICAqL1xuICAgICAgICByZW1vdmVBbGwgOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICB2YXIgbiA9IHRoaXMuX2JpbmRpbmdzLmxlbmd0aDtcbiAgICAgICAgICAgIHdoaWxlIChuLS0pIHtcbiAgICAgICAgICAgICAgICB0aGlzLl9iaW5kaW5nc1tuXS5fZGVzdHJveSgpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy5fYmluZGluZ3MubGVuZ3RoID0gMDtcbiAgICAgICAgfSxcblxuICAgICAgICAvKipcbiAgICAgICAgICogQHJldHVybiB7bnVtYmVyfSBOdW1iZXIgb2YgbGlzdGVuZXJzIGF0dGFjaGVkIHRvIHRoZSBTaWduYWwuXG4gICAgICAgICAqL1xuICAgICAgICBnZXROdW1MaXN0ZW5lcnMgOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5fYmluZGluZ3MubGVuZ3RoO1xuICAgICAgICB9LFxuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBTdG9wIHByb3BhZ2F0aW9uIG9mIHRoZSBldmVudCwgYmxvY2tpbmcgdGhlIGRpc3BhdGNoIHRvIG5leHQgbGlzdGVuZXJzIG9uIHRoZSBxdWV1ZS5cbiAgICAgICAgICogPHA+PHN0cm9uZz5JTVBPUlRBTlQ6PC9zdHJvbmc+IHNob3VsZCBiZSBjYWxsZWQgb25seSBkdXJpbmcgc2lnbmFsIGRpc3BhdGNoLCBjYWxsaW5nIGl0IGJlZm9yZS9hZnRlciBkaXNwYXRjaCB3b24ndCBhZmZlY3Qgc2lnbmFsIGJyb2FkY2FzdC48L3A+XG4gICAgICAgICAqIEBzZWUgU2lnbmFsLnByb3RvdHlwZS5kaXNhYmxlXG4gICAgICAgICAqL1xuICAgICAgICBoYWx0IDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgdGhpcy5fc2hvdWxkUHJvcGFnYXRlID0gZmFsc2U7XG4gICAgICAgIH0sXG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIERpc3BhdGNoL0Jyb2FkY2FzdCBTaWduYWwgdG8gYWxsIGxpc3RlbmVycyBhZGRlZCB0byB0aGUgcXVldWUuXG4gICAgICAgICAqIEBwYXJhbSB7Li4uKn0gW3BhcmFtc10gUGFyYW1ldGVycyB0aGF0IHNob3VsZCBiZSBwYXNzZWQgdG8gZWFjaCBoYW5kbGVyLlxuICAgICAgICAgKi9cbiAgICAgICAgZGlzcGF0Y2ggOiBmdW5jdGlvbiAocGFyYW1zKSB7XG4gICAgICAgICAgICBpZiAoISB0aGlzLmFjdGl2ZSkge1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdmFyIHBhcmFtc0FyciA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cyksXG4gICAgICAgICAgICAgICAgbiA9IHRoaXMuX2JpbmRpbmdzLmxlbmd0aCxcbiAgICAgICAgICAgICAgICBiaW5kaW5ncztcblxuICAgICAgICAgICAgaWYgKHRoaXMubWVtb3JpemUpIHtcbiAgICAgICAgICAgICAgICB0aGlzLl9wcmV2UGFyYW1zID0gcGFyYW1zQXJyO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoISBuKSB7XG4gICAgICAgICAgICAgICAgLy9zaG91bGQgY29tZSBhZnRlciBtZW1vcml6ZVxuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgYmluZGluZ3MgPSB0aGlzLl9iaW5kaW5ncy5zbGljZSgpOyAvL2Nsb25lIGFycmF5IGluIGNhc2UgYWRkL3JlbW92ZSBpdGVtcyBkdXJpbmcgZGlzcGF0Y2hcbiAgICAgICAgICAgIHRoaXMuX3Nob3VsZFByb3BhZ2F0ZSA9IHRydWU7IC8vaW4gY2FzZSBgaGFsdGAgd2FzIGNhbGxlZCBiZWZvcmUgZGlzcGF0Y2ggb3IgZHVyaW5nIHRoZSBwcmV2aW91cyBkaXNwYXRjaC5cblxuICAgICAgICAgICAgLy9leGVjdXRlIGFsbCBjYWxsYmFja3MgdW50aWwgZW5kIG9mIHRoZSBsaXN0IG9yIHVudGlsIGEgY2FsbGJhY2sgcmV0dXJucyBgZmFsc2VgIG9yIHN0b3BzIHByb3BhZ2F0aW9uXG4gICAgICAgICAgICAvL3JldmVyc2UgbG9vcCBzaW5jZSBsaXN0ZW5lcnMgd2l0aCBoaWdoZXIgcHJpb3JpdHkgd2lsbCBiZSBhZGRlZCBhdCB0aGUgZW5kIG9mIHRoZSBsaXN0XG4gICAgICAgICAgICBkbyB7IG4tLTsgfSB3aGlsZSAoYmluZGluZ3Nbbl0gJiYgdGhpcy5fc2hvdWxkUHJvcGFnYXRlICYmIGJpbmRpbmdzW25dLmV4ZWN1dGUocGFyYW1zQXJyKSAhPT0gZmFsc2UpO1xuICAgICAgICB9LFxuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBGb3JnZXQgbWVtb3JpemVkIGFyZ3VtZW50cy5cbiAgICAgICAgICogQHNlZSBTaWduYWwubWVtb3JpemVcbiAgICAgICAgICovXG4gICAgICAgIGZvcmdldCA6IGZ1bmN0aW9uKCl7XG4gICAgICAgICAgICB0aGlzLl9wcmV2UGFyYW1zID0gbnVsbDtcbiAgICAgICAgfSxcblxuICAgICAgICAvKipcbiAgICAgICAgICogUmVtb3ZlIGFsbCBiaW5kaW5ncyBmcm9tIHNpZ25hbCBhbmQgZGVzdHJveSBhbnkgcmVmZXJlbmNlIHRvIGV4dGVybmFsIG9iamVjdHMgKGRlc3Ryb3kgU2lnbmFsIG9iamVjdCkuXG4gICAgICAgICAqIDxwPjxzdHJvbmc+SU1QT1JUQU5UOjwvc3Ryb25nPiBjYWxsaW5nIGFueSBtZXRob2Qgb24gdGhlIHNpZ25hbCBpbnN0YW5jZSBhZnRlciBjYWxsaW5nIGRpc3Bvc2Ugd2lsbCB0aHJvdyBlcnJvcnMuPC9wPlxuICAgICAgICAgKi9cbiAgICAgICAgZGlzcG9zZSA6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHRoaXMucmVtb3ZlQWxsKCk7XG4gICAgICAgICAgICBkZWxldGUgdGhpcy5fYmluZGluZ3M7XG4gICAgICAgICAgICBkZWxldGUgdGhpcy5fcHJldlBhcmFtcztcbiAgICAgICAgfSxcblxuICAgICAgICAvKipcbiAgICAgICAgICogQHJldHVybiB7c3RyaW5nfSBTdHJpbmcgcmVwcmVzZW50YXRpb24gb2YgdGhlIG9iamVjdC5cbiAgICAgICAgICovXG4gICAgICAgIHRvU3RyaW5nIDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgcmV0dXJuICdbU2lnbmFsIGFjdGl2ZTonKyB0aGlzLmFjdGl2ZSArJyBudW1MaXN0ZW5lcnM6JysgdGhpcy5nZXROdW1MaXN0ZW5lcnMoKSArJ10nO1xuICAgICAgICB9XG5cbiAgICB9O1xuXG5cbiAgICAvLyBOYW1lc3BhY2UgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICAvLz09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuICAgIC8qKlxuICAgICAqIFNpZ25hbHMgbmFtZXNwYWNlXG4gICAgICogQG5hbWVzcGFjZVxuICAgICAqIEBuYW1lIHNpZ25hbHNcbiAgICAgKi9cbiAgICB2YXIgc2lnbmFscyA9IFNpZ25hbDtcblxuICAgIC8qKlxuICAgICAqIEN1c3RvbSBldmVudCBicm9hZGNhc3RlclxuICAgICAqIEBzZWUgU2lnbmFsXG4gICAgICovXG4gICAgLy8gYWxpYXMgZm9yIGJhY2t3YXJkcyBjb21wYXRpYmlsaXR5IChzZWUgI2doLTQ0KVxuICAgIHNpZ25hbHMuU2lnbmFsID0gU2lnbmFsO1xuXG5cblxuICAgIC8vZXhwb3J0cyB0byBtdWx0aXBsZSBlbnZpcm9ubWVudHNcbiAgICBpZih0eXBlb2YgZGVmaW5lID09PSAnZnVuY3Rpb24nICYmIGRlZmluZS5hbWQpeyAvL0FNRFxuICAgICAgICBkZWZpbmUoZnVuY3Rpb24gKCkgeyByZXR1cm4gc2lnbmFsczsgfSk7XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgbW9kdWxlICE9PSAndW5kZWZpbmVkJyAmJiBtb2R1bGUuZXhwb3J0cyl7IC8vbm9kZVxuICAgICAgICBtb2R1bGUuZXhwb3J0cyA9IHNpZ25hbHM7XG4gICAgfSBlbHNlIHsgLy9icm93c2VyXG4gICAgICAgIC8vdXNlIHN0cmluZyBiZWNhdXNlIG9mIEdvb2dsZSBjbG9zdXJlIGNvbXBpbGVyIEFEVkFOQ0VEX01PREVcbiAgICAgICAgLypqc2xpbnQgc3ViOnRydWUgKi9cbiAgICAgICAgZ2xvYmFsWydzaWduYWxzJ10gPSBzaWduYWxzO1xuICAgIH1cblxufSh0aGlzKSk7XG4iLCIvKipcbiAqIFJ1biBhIHN0ZXAgb2YgbW9kaWZ5aW5nIGEgbm9kZSBncmFwaC4gVGhpcyB0YWtlcyBhIEpTT04gc3RydWN0dXJlIGFzIGNhblxuICogYmUgc2VlbiBpbiB0aGUgc3JjL2FjdGlvbnMgZm9sZGVyIHRoYXQgdGhlbiBkZWZpbmVzIGhvdyB0byBtb2RpZnkgdGhlIG5vZGVcbiAqIGdyYXBoLlxuICovXG5cbmNvbnN0IE5PREVfU1BSRUFEID0gMC4wMVxuXG5leHBvcnRzLmFkZE5vZGUgPSBmdW5jdGlvbiAoe2VsLCBub2RlcywgbGlua3N9LCBub2RlKSB7XG4gIC8vIEFsbG93IG5vZGVzIHRvIGJlIHJlbmFtZWQgbGF0ZXIgb24sIGJ1dCBhbHdheXMgcmV2ZXJ0IHdoZW4gcmUtYWRkaW5nLlxuICBpZihub2RlLnJlbmFtZSkge1xuICAgIG5vZGUucmVuYW1lID0gXCJcIlxuICB9XG5cbiAgaWYobm9kZXMuZmluZCgoe2lkfSkgPT4gaWQgPT09IG5vZGUpKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdBIG5vZGUgYWxyZWFkeSBleGlzdHMgd2l0aCB0aGF0IGlkJylcbiAgfVxuXG4gIC8vIE5vZGVzIHRlbmQgdG8gYmUgZnVua3kgd2l0aCB0aGUgZm9yY2UgbGF5b3V0IHdoZW4gaW5jcmVtZW50YWxseSBhZGRlZC5cbiAgLy8gUGxhY2UgdGhlbSBuZWFyIHRoZSBjZW50ZXIgcmFuZG9tbHkgdG8gYWlkIGluIHRoZSBsYXlvdXQgb24gdGhlIHNjcmVlbi5cbiAgaWYobm9kZS54ID09PSB1bmRlZmluZWQpIHtcbiAgICBjb25zdCB3ID0gZWwub2Zmc2V0V2lkdGhcbiAgICBjb25zdCBoID0gZWwub2Zmc2V0SGVpZ2h0IC8gMlxuICAgIG5vZGUueCA9IHcgLyAyICsgKE1hdGgucmFuZG9tKCkgKiB3IC0gdyAvIDIpICogTk9ERV9TUFJFQURcbiAgICBub2RlLnkgPSBoIC8gMiArIChNYXRoLnJhbmRvbSgpICogaCAtIGggLyAyKSAqIE5PREVfU1BSRUFEXG4gIH1cbiAgbm9kZXMucHVzaChub2RlKVxufSxcblxuZXhwb3J0cy5yZW5hbWUgPSBmdW5jdGlvbiAoe25vZGVzLCBsaW5rc30sIFtpZCwgdmFsdWVdKSB7XG4gIGNvbnN0IG5vZGUgPSBub2Rlcy5maW5kKG4gPT4gbi5pZCA9PT0gaWQpXG4gIGlmICghbm9kZSkgdGhyb3cgbmV3IEVycm9yKFwiQ291bGQgbm90IGZpbmQgdGhhdCBub2RlIHRvIHJlbW92ZS5cIilcbiAgbm9kZS5yZW5hbWUgPSB2YWx1ZVxufSxcblxuZXhwb3J0cy5hZGRMaW5rID0gZnVuY3Rpb24gKHtub2RlcywgbGlua3N9LCBsaW5rKSB7XG4gIGNvbnN0IHtzb3VyY2UsIHRhcmdldCwgZGlzcGxheSwgZGFzaGVkfSA9IGxpbms7XG4gIGNvbnN0IHNvdXJjZU5vZGUgPSB0eXBlb2Ygc291cmNlID09PSAnb2JqZWN0J1xuICAgID8gc291cmNlXG4gICAgOiBub2Rlcy5maW5kKCh7aWR9KSA9PiBpZCA9PT0gc291cmNlKVxuICBjb25zdCB0YXJnZXROb2RlID0gdHlwZW9mIHNvdXJjZSA9PT0gJ29iamVjdCdcbiAgICA/IHRhcmdldFxuICAgIDogbm9kZXMuZmluZCgoe2lkfSkgPT4gaWQgPT09IHRhcmdldClcbiAgaWYoIXNvdXJjZU5vZGUgfHwgIXRhcmdldE5vZGUpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoYENvdWxkIG5vdCBmaW5kIHRob3NlIG5vZGVzIHRvIGxpbmsuIFwiJHtzb3VyY2V9XCIgdG8gXCIke3RhcmdldH1cImApXG4gIH1cbiAgbGluay5zb3VyY2UgPSBzb3VyY2VOb2RlXG4gIGxpbmsudGFyZ2V0ID0gdGFyZ2V0Tm9kZVxuICBpZihsaW5rLnJlbmFtZSkgbGluay5yZW5hbWUgPSBcIlwiXG4gIGxpbmtzLnB1c2gobGluaylcbn0sXG5cbmV4cG9ydHMucmVtb3ZlTm9kZSA9IGZ1bmN0aW9uICh7bm9kZXMsIGxpbmtzfSwgaWQpIHtcbiAgY29uc3Qgbm9kZSA9IG5vZGVzLmZpbmQobiA9PiBuLmlkID09PSBpZClcbiAgaWYgKCFub2RlKSB0aHJvdyBuZXcgRXJyb3IoXCJDb3VsZCBub3QgZmluZCB0aGF0IG5vZGUgdG8gcmVtb3ZlLlwiKVxuICBub2Rlcy5zcGxpY2Uobm9kZXMuaW5kZXhPZihub2RlKSwgMSlcblxuICBjb25zdCBzb3VyY2VzID0gbGlua3MuZmlsdGVyKCh7c291cmNlfSkgPT4gc291cmNlLmlkID09PSBpZClcbiAgc291cmNlcy5mb3JFYWNoKHNvdXJjZSA9PiBsaW5rcy5zcGxpY2UobGlua3MuaW5kZXhPZihzb3VyY2UpLCAxKSlcblxuICBjb25zdCB0YXJnZXRzID0gbGlua3MuZmlsdGVyKCh7XywgdGFyZ2V0fSkgPT4gdGFyZ2V0LmlkID09PSBpZClcbiAgdGFyZ2V0cy5mb3JFYWNoKHRhcmdldCA9PiBsaW5rcy5zcGxpY2UobGlua3MuaW5kZXhPZih0YXJnZXQpLCAxKSlcbn0sXG5cbmV4cG9ydHMucmVtb3ZlTGluayA9IGZ1bmN0aW9uICh7bm9kZXMsIGxpbmtzfSwgW3NvdXJjZUlkLCB0YXJnZXRJZF0pIHtcbiAgY29uc3QgbGluayA9IGxpbmtzLmZpbmQoKHtzb3VyY2UsIHRhcmdldH0pID0+IHtcbiAgICByZXR1cm4gc291cmNlLmlkID09PSBzb3VyY2VJZCAmJiB0YXJnZXQuaWQgPT09IHRhcmdldElkXG4gIH0pXG4gIGlmICghbGluaykgdGhyb3cgbmV3IEVycm9yKFwiQ291bGQgbm90IGZpbmQgdGhhdCBsaW5rIHRvIHJlbW92ZS5cIilcbiAgbGlua3Muc3BsaWNlKGxpbmtzLmluZGV4T2YobGluayksIDEpXG59XG5cbmV4cG9ydHMucmVuYW1lTGluayA9IGZ1bmN0aW9uICh7bm9kZXMsIGxpbmtzfSwge3NvdXJjZSwgdGFyZ2V0LCBkaXNwbGF5fSkge1xuICBjb25zdCBsaW5rID0gbGlua3MuZmluZCgoYikgPT4ge1xuICAgIHJldHVybiBiLnNvdXJjZS5pZCA9PT0gc291cmNlICYmIGIudGFyZ2V0LmlkID09PSB0YXJnZXRcbiAgfSlcbiAgaWYgKCFsaW5rKSB0aHJvdyBuZXcgRXJyb3IoXCJDb3VsZCBub3QgZmluZCB0aGF0IGxpbmsgdG8gcmVtb3ZlLlwiKVxuICBsaW5rLnJlbmFtZSA9IGRpc3BsYXlcbn1cblxuXG5leHBvcnRzLmhpZ2hsaWdodCA9IGZ1bmN0aW9uICh7ZWRpdG9yfSwgdmFsdWUpIHtcblxuICBsZXQgW3N0YXJ0LCBlbmRdID0gQXJyYXkuaXNBcnJheSh2YWx1ZSkgPyB2YWx1ZSA6IFt2YWx1ZSwgdmFsdWVdXG4gIGxldCBbc3RhcnRMaW5lLCBzdGFydENoXSA9IFN0cmluZyhzdGFydCkuc3BsaXQoJzonKVxuICBsZXQgW2VuZExpbmUsIGVuZENoXSA9IFN0cmluZyhlbmQpLnNwbGl0KCc6JylcblxuICBpZighZW5kQ2gpIHtcbiAgICBlbmRMaW5lKytcbiAgfVxuICBzdGFydENoID0gTWF0aC5tYXgoMCwgc3RhcnRDaC0xKVxuICBlbmRDaCA9IE1hdGgubWF4KDAsIGVuZENoLTEpXG5cbiAgZWRpdG9yLm1hcmtUZXh0KFxuICAgIHtsaW5lOiBzdGFydExpbmUgLSAxLCBjaDogc3RhcnRDaCB8fCAwfSxcbiAgICB7bGluZTogZW5kTGluZSAtIDEsIGNoOiBlbmRDaCB8fCAwfSxcbiAgICB7XG4gICAgICBjbGFzc05hbWU6IFwiaGlnaGxpZ2h0ZWQtbGluZVwiXG4gICAgfVxuICApXG59XG4iLCJleHBvcnRzLmNvZGUgPSBgZnVuY3Rpb24gc2F5U29tZXRoaW5nKCkge1xuICB2YXIgbWVzc2FnZSA9IFwiTHVrZSwgSSBhbSB5b3VyIGZhdGhlci5cIjtcbiAgY29uc29sZS5sb2cobWVzc2FnZSk7XG59XG5cbmZ1bmN0aW9uIHdoaXNwZXJTb21ldGhpbmcoKSB7XG4gIG1lc3NhZ2UgPSBcIkkgc2VlIGRlYWQgcGVvcGxlLlwiO1xuICBjb25zb2xlLmxvZyhtZXNzYWdlKTtcbn1cblxuZnVuY3Rpb24gc2hvdXRTb21ldGhpbmcoKSB7XG4gIHRoaXMubWVzc2FnZSA9IFwiSSBzb3VuZCBteSBiYXJiYXJpYyB5YXdwLlwiO1xuICBjb25zb2xlLmxvZyh0aGlzLm1lc3NhZ2UpO1xufVxuXG5zYXlTb21ldGhpbmcoKTtcbndoaXNwZXJTb21ldGhpbmcoKTtcbnNob3V0U29tZXRoaW5nKCk7XG5gXG5cbmV4cG9ydHMuc3RlcHMgPSBbXG4gIFtcbiAgICBbXCJhZGROb2RlXCIsIHt0eXBlOiBcIndpbmRvd1wiLCBpZDogXCJ3aW5kb3dcIn1dLFxuICAgIFtcImFkZE5vZGVcIiwge3R5cGU6IFwiY2FsbFN0YWNrXCIsIGlkOiBcImNhbGxTdGFja1wifV0sXG4gIF0sXG4gIFtcbiAgICAvL3NheVNvbWV0aGluZygpO1xuICAgIFtcImhpZ2hsaWdodFwiLCAxNl0sXG4gICAgW1wiYWRkTm9kZVwiLCB7dHlwZTogXCJmdW5jdGlvblwiLCBpZDogXCJzYXlTb21ldGhpbmdcIiwgZGlzcGxheTogXCJzY29wZVwifV0sXG4gICAgW1wiYWRkTGlua1wiLCB7c291cmNlOiBcImNhbGxTdGFja1wiLCB0YXJnZXQ6IFwic2F5U29tZXRoaW5nXCIsIGRpc3BsYXk6IFwic2F5U29tZXRoaW5nXCJ9XSxcbiAgXSxcbiAgW1xuICAgIC8vdmFyIG1lc3NhZ2UgPSBcIkx1a2UsIEkgYW0geW91ciBmYXRoZXIuXCI7XG4gICAgW1wiaGlnaGxpZ2h0XCIsIDJdLFxuICAgIFtcImFkZE5vZGVcIiwge3R5cGU6IFwidmFsdWVcIiwgZGlzcGxheTogXCJMdWtlLCBJIGFtIHlvdXIgZmF0aGVyLlwiLCBpZDogXCJtZXNzYWdlMVwifV0sXG4gICAgW1wiYWRkTGlua1wiLCB7c291cmNlOiBcInNheVNvbWV0aGluZ1wiLCB0YXJnZXQ6IFwibWVzc2FnZTFcIiwgZGlzcGxheTogXCJtZXNzYWdlXCIsIGRpc3RhbmNlOiAxLjV9XSxcbiAgXSxcbiAgW1xuICAgIFtcInJlbW92ZU5vZGVcIiwgXCJzYXlTb21ldGhpbmdcIl0sXG4gICAgW1wiaGlnaGxpZ2h0XCIsIFsxLDRdXSxcbiAgXSxcbiAgW1xuICAgIFtcInJlbW92ZU5vZGVcIiwgXCJtZXNzYWdlMVwiXSxcbiAgXSxcbiAgW1xuICAgIC8vd2hpc3BlclNvbWV0aGluZygpO1xuICAgIFtcImhpZ2hsaWdodFwiLCAxN10sXG4gICAgW1wiYWRkTm9kZVwiLCB7dHlwZTogXCJmdW5jdGlvblwiLCBpZDogXCJ3aGlzcGVyU29tZXRoaW5nXCIsIGRpc3BsYXk6IFwic2NvcGVcIn1dLFxuICAgIFtcImFkZExpbmtcIiwge3NvdXJjZTogXCJjYWxsU3RhY2tcIiwgdGFyZ2V0OiBcIndoaXNwZXJTb21ldGhpbmdcIiwgZGlzcGxheTogXCJ3aGlzcGVyU29tZXRoaW5nXCJ9XSxcbiAgXSxcbiAgW1xuICAgIC8vdmFyIG1lc3NhZ2UgPSBcIkx1a2UsIEkgYW0geW91ciBmYXRoZXIuXCI7XG4gICAgW1wiaGlnaGxpZ2h0XCIsIDddLFxuICAgIFtcImFkZE5vZGVcIiwge3R5cGU6IFwidmFsdWVcIiwgZGlzcGxheTogXCJJIHNlZSBkZWFkIHBlb3BsZS5cIiwgaWQ6IFwibWVzc2FnZTJcIn1dLFxuICAgIFtcImFkZExpbmtcIiwge3NvdXJjZTogXCJ3aW5kb3dcIiwgdGFyZ2V0OiBcIm1lc3NhZ2UyXCIsIGRpc3BsYXk6IFwibWVzc2FnZVwiLCBkaXN0YW5jZTogMS41fV0sXG4gICAgW1wiYWRkTGlua1wiLCB7c291cmNlOiBcIndoaXNwZXJTb21ldGhpbmdcIiwgdGFyZ2V0OiBcIm1lc3NhZ2UyXCIsIGRpc3BsYXk6IFwid2luZG93Lm1lc3NhZ2VcIiwgZGlzdGFuY2U6IDIuNSwgZGFzaGVkOiB0cnVlfV0sXG4gIF0sXG4gIFtcbiAgICBbXCJyZW1vdmVOb2RlXCIsIFwid2hpc3BlclNvbWV0aGluZ1wiXSxcbiAgICBbXCJoaWdobGlnaHRcIiwgWzYsOV1dLFxuICBdLFxuICBbXG4gICAgLy9zaG91dFNvbWV0aGluZygpO1xuICAgIFtcImhpZ2hsaWdodFwiLCAxOF0sXG4gICAgW1wiYWRkTm9kZVwiLCB7dHlwZTogXCJmdW5jdGlvblwiLCBpZDogXCJzaG91dFNvbWV0aGluZ1wiLCBkaXNwbGF5OiBcInNjb3BlXCJ9XSxcbiAgICBbXCJhZGRMaW5rXCIsIHtzb3VyY2U6IFwiY2FsbFN0YWNrXCIsIHRhcmdldDogXCJzaG91dFNvbWV0aGluZ1wiLCBkaXNwbGF5OiBcInNob3V0U29tZXRoaW5nXCJ9XSxcbiAgXSxcbiAgW1xuICAgIC8vdmFyIG1lc3NhZ2UgPSBcIkx1a2UsIEkgYW0geW91ciBmYXRoZXIuXCI7XG4gICAgW1wiaGlnaGxpZ2h0XCIsIDEyXSxcbiAgICBbXCJhZGROb2RlXCIsIHt0eXBlOiBcInZhbHVlXCIsIGRpc3BsYXk6IFwiSSBzb3VuZCBteSBiYXJiYXJpYyB5YXdwLlwiLCBpZDogXCJtZXNzYWdlM1wifV0sXG4gICAgW1wiYWRkTGlua1wiLCB7c291cmNlOiBcInNob3V0U29tZXRoaW5nXCIsIHRhcmdldDogXCJtZXNzYWdlM1wiLCBkaXNwbGF5OiBcIndpbmRvdy5tZXNzYWdlXCIsIGRpc3RhbmNlOiAyLjUsIGRhc2hlZDogdHJ1ZX1dLFxuICAgIFtcInJlbW92ZUxpbmtcIiwgW1wid2luZG93XCIsIFwibWVzc2FnZTJcIl1dLFxuICAgIFtcImFkZExpbmtcIiwge3NvdXJjZTogXCJ3aW5kb3dcIiwgdGFyZ2V0OiBcIm1lc3NhZ2UzXCIsIGRpc3BsYXk6IFwibWVzc2FnZVwiLCBkaXN0YW5jZTogMS41fV0sXG4gIF0sXG4gIFtcbiAgICBbXCJyZW1vdmVOb2RlXCIsIFwibWVzc2FnZTJcIl0sXG4gIF0sXG4gIFtcbiAgICBbXCJyZW1vdmVOb2RlXCIsIFwic2hvdXRTb21ldGhpbmdcIl0sXG4gICAgW1wiaGlnaGxpZ2h0XCIsIFsxMSwxNF1dLFxuICBdLFxuICBbXG4gIF0sXG5dXG4iLCJleHBvcnRzLmNvZGUgPSBgdmFyIG15TnVtYmVyID0gMDtcbnZhciBteU9iamVjdCA9IHtmb286ICdiYXInfTtcbnZhciBteUFycmF5ID0gWydhJywnYicsJ2MnLCdkJywnZSddO1xuXG5mdW5jdGlvbiBteUZ1bmN0aW9uKCkge1xuICBjb25zb2xlLmxvZygnV2VsbCB0aGlzIGlzIGZ1bicpXG59XG5cbm15TnVtYmVyID0gdW5kZWZpbmVkO1xubXlPYmplY3QgPSB1bmRlZmluZWQ7XG5kZWxldGUgd2luZG93Lm15RnVuY3Rpb247XG5cbnNldFRpbWVvdXQoZnVuY3Rpb24oKSB7XG4gIG15QXJyYXkgPSB1bmRlZmluZWQ7XG59LCAxMDAwMCk7XG5gXG5cbmV4cG9ydHMubGluZUxlbmd0aCA9IDYwXG5cbmV4cG9ydHMuc3RlcHMgPSBbXG4gIFtcbiAgICBbXCJhZGROb2RlXCIsIHt0eXBlOiBcIndpbmRvd1wiLCBpZDogXCJ3aW5kb3dcIn1dLFxuICBdLFxuICBbXG4gICAgW1wiYWRkTm9kZVwiLCB7dHlwZTogXCJ2YWx1ZVwiLCBpZDogXCJteU51bWJlclwiLCBkaXNwbGF5OiBcIjBcIn1dLFxuICAgIFtcImFkZExpbmtcIiwge3NvdXJjZTogXCJ3aW5kb3dcIiwgdGFyZ2V0OiBcIm15TnVtYmVyXCIsIGRpc3BsYXk6IFwibXlOdW1iZXJcIiwgZGlzdGFuY2U6IDEuNX1dLFxuICAgIFtcImhpZ2hsaWdodFwiLCAxXSxcbiAgXSxcbiAgW1xuICAgIFtcImFkZE5vZGVcIiwge3R5cGU6IFwib2JqZWN0XCIsIGlkOiBcIm15T2JqZWN0XCIsIGRpc3BsYXk6IFwieyB9XCJ9XSxcbiAgICBbXCJhZGRMaW5rXCIsIHtzb3VyY2U6IFwid2luZG93XCIsIHRhcmdldDogXCJteU9iamVjdFwiLCBkaXNwbGF5OiBcIm15T2JqZWN0XCJ9XSxcbiAgICBbXCJoaWdobGlnaHRcIiwgMl0sXG4gIF0sXG4gIFtcbiAgICBbXCJhZGROb2RlXCIsIHt0eXBlOiBcImFycmF5XCIsIGlkOiBcIm15QXJyYXlcIiwgZGlzcGxheTogXCJbIF1cIn1dLFxuICAgIFtcImFkZE5vZGVcIiwge3R5cGU6IFwidmFsdWVcIiwgaWQ6IFwiYXJyYXktYVwiLCBkaXNwbGF5OiBcImFcIn1dLFxuICAgIFtcImFkZE5vZGVcIiwge3R5cGU6IFwidmFsdWVcIiwgaWQ6IFwiYXJyYXktYlwiLCBkaXNwbGF5OiBcImJcIn1dLFxuICAgIFtcImFkZE5vZGVcIiwge3R5cGU6IFwidmFsdWVcIiwgaWQ6IFwiYXJyYXktY1wiLCBkaXNwbGF5OiBcImNcIn1dLFxuICAgIFtcImFkZE5vZGVcIiwge3R5cGU6IFwidmFsdWVcIiwgaWQ6IFwiYXJyYXktZFwiLCBkaXNwbGF5OiBcImRcIn1dLFxuICAgIFtcImFkZE5vZGVcIiwge3R5cGU6IFwidmFsdWVcIiwgaWQ6IFwiYXJyYXktZVwiLCBkaXNwbGF5OiBcImVcIn1dLFxuICAgIFtcImFkZExpbmtcIiwge3NvdXJjZTogXCJ3aW5kb3dcIiwgdGFyZ2V0OiBcIm15QXJyYXlcIiwgZGlzcGxheTogXCJteUFycmF5XCJ9XSxcbiAgICBbXCJhZGRMaW5rXCIsIHtzb3VyY2U6IFwibXlBcnJheVwiLCB0YXJnZXQ6IFwiYXJyYXktYVwifV0sXG4gICAgW1wiYWRkTGlua1wiLCB7c291cmNlOiBcIm15QXJyYXlcIiwgdGFyZ2V0OiBcImFycmF5LWJcIn1dLFxuICAgIFtcImFkZExpbmtcIiwge3NvdXJjZTogXCJteUFycmF5XCIsIHRhcmdldDogXCJhcnJheS1jXCJ9XSxcbiAgICBbXCJhZGRMaW5rXCIsIHtzb3VyY2U6IFwibXlBcnJheVwiLCB0YXJnZXQ6IFwiYXJyYXktZFwifV0sXG4gICAgW1wiYWRkTGlua1wiLCB7c291cmNlOiBcIm15QXJyYXlcIiwgdGFyZ2V0OiBcImFycmF5LWVcIn1dLFxuICAgIFtcImhpZ2hsaWdodFwiLCAzXSxcbiAgXSxcbiAgW1xuICAgIFtcImFkZE5vZGVcIiwge3R5cGU6IFwiZnVuY3Rpb25cIiwgaWQ6IFwibXlGdW5jdGlvblwiLCBkaXNwbGF5OiBcImZ1bmN0aW9uKCkge31cIn1dLFxuICAgIFtcImFkZExpbmtcIiwge3NvdXJjZTogXCJ3aW5kb3dcIiwgdGFyZ2V0OiBcIm15RnVuY3Rpb25cIiwgZGlzcGxheTogXCJteUZ1bmN0aW9uXCJ9XSxcbiAgICBbXCJoaWdobGlnaHRcIiwgWzUsN11dLFxuICBdLFxuICBbXG4gICAgW1wicmVtb3ZlTGlua1wiLCBbXCJ3aW5kb3dcIiwgXCJteU51bWJlclwiXV0sXG4gICAgW1wiaGlnaGxpZ2h0XCIsIDldLFxuICBdLFxuICBbXG4gICAgW1wicmVtb3ZlTGlua1wiLCBbXCJ3aW5kb3dcIiwgXCJteU9iamVjdFwiXV0sXG4gICAgW1wiaGlnaGxpZ2h0XCIsIDEwXSxcbiAgXSxcbiAgW1xuICAgIFtcInJlbW92ZUxpbmtcIiwgW1wid2luZG93XCIsIFwibXlGdW5jdGlvblwiXV0sXG4gICAgW1wiaGlnaGxpZ2h0XCIsIDExXSxcbiAgXSxcbiAgW1xuICAgIFtcImhpZ2hsaWdodFwiLCBbMTMsIDE1XV0sXG4gIF0sXG4gIFtcbiAgICBbXCJyZW1vdmVOb2RlXCIsIFwibXlOdW1iZXJcIl0sXG4gIF0sXG4gIFtcbiAgICBbXCJyZW1vdmVOb2RlXCIsIFwibXlPYmplY3RcIl0sXG4gIF0sXG4gIFtcbiAgICBbXCJyZW1vdmVOb2RlXCIsIFwibXlGdW5jdGlvblwiXSxcbiAgXSxcbiAgW1xuICAgIFtcInJlbW92ZUxpbmtcIiwgW1wid2luZG93XCIsIFwibXlBcnJheVwiXV0sXG4gICAgW1wiaGlnaGxpZ2h0XCIsIDE0XSxcbiAgXSxcbiAgW1xuICAgIFtcInJlbW92ZU5vZGVcIiwgXCJteUFycmF5XCJdLFxuICAgIFtcInJlbW92ZU5vZGVcIiwgXCJhcnJheS1hXCJdLFxuICAgIFtcInJlbW92ZU5vZGVcIiwgXCJhcnJheS1iXCJdLFxuICAgIFtcInJlbW92ZU5vZGVcIiwgXCJhcnJheS1jXCJdLFxuICAgIFtcInJlbW92ZU5vZGVcIiwgXCJhcnJheS1kXCJdLFxuICAgIFtcInJlbW92ZU5vZGVcIiwgXCJhcnJheS1lXCJdLFxuICBdLFxuXVxuIiwiZXhwb3J0cy5jb2RlID0gYGZ1bmN0aW9uIE15QmlnQXBwKCkgeyAuLi4gfVxuXG52YXIgbXlBcHAgPSBuZXcgTXlCaWdBcHAoKTtcblxuJCgnI2Nsb3NlLWJ1dHRvbicpLmNsaWNrKFxuICBteUFwcC5jbG9zZS5iaW5kKG15QXBwKVxuKTtcblxubXlBcHAgPSB1bmRlZmluZWQ7XG5gXG5cbmV4cG9ydHMuc3RlcHMgPSBbXG4gIFtcbiAgICBbXCJhZGROb2RlXCIsIHt0eXBlOiBcIndpbmRvd1wiLCBpZDogXCJ3aW5kb3dcIn1dLFxuICAgIFtcImFkZE5vZGVcIiwge2Rpc3BsYXk6IFwiI2Nsb3NlLWJ1dHRvblwiLCB0eXBlOiBcIm9iamVjdFwiLCBpZDogXCJidXR0b25cIn1dLFxuICAgIFtcImFkZExpbmtcIiwge3NvdXJjZTogXCJ3aW5kb3dcIiwgdGFyZ2V0OiBcImJ1dHRvblwiLCBkYXNoZWQ6IHRydWV9XSxcbiAgICAvLyBbXCJhZGROb2RlXCIsIHt0eXBlOiBcImNhbGxTdGFja1wiLCBpZDogXCJjYWxsU3RhY2tcIn1dLFxuICBdLFxuICBbXG4gICAgW1wiaGlnaGxpZ2h0XCIsIDFdLFxuICBdLFxuICBbXG4gICAgW1wiYWRkTm9kZVwiLCB7ZGlzcGxheTogXCIuIC4gLi4gIHsgfVwiLCB0eXBlOiBcIm9iamVjdFwiLCBpZDogXCJteUFwcFwiLCByYWRpdXM6IDN9XSxcbiAgICBbXCJhZGRMaW5rXCIsIHtzb3VyY2U6IFwid2luZG93XCIsIHRhcmdldDogXCJteUFwcFwiLCBkaXNwbGF5OiBcIm15QXBwXCIsIGRpc3RhbmNlOiAyfV0sXG4gICAgW1wiaGlnaGxpZ2h0XCIsIDNdLFxuICBdLFxuICBbXG4gICAgW1wiYWRkTm9kZVwiLCB7ZGlzcGxheTogXCJteUFwcC5jbG9zZSgpXCIsIHR5cGU6IFwib2JqZWN0XCIsIGlkOiBcImNsb3NlXCJ9XSxcbiAgICBbXCJhZGRMaW5rXCIsIHtzb3VyY2U6IFwiY2xvc2VcIiwgdGFyZ2V0OiBcIm15QXBwXCIsIGRpc3BsYXk6IFwiYmluZFwiLCBkaXN0YW5jZTogMn1dLFxuICAgIFtcImhpZ2hsaWdodFwiLCA2XSxcbiAgXSxcbiAgW1xuICAgIFtcImFkZExpbmtcIiwge3NvdXJjZTogXCJidXR0b25cIiwgdGFyZ2V0OiBcImNsb3NlXCIsIGRpc3BsYXk6IFwiY2xpY2sgaGFuZGxlclwiLCBkaXN0YW5jZTogMn1dLFxuICAgIFtcImhpZ2hsaWdodFwiLCBbNSwgN11dLFxuICBdLFxuICBbXG4gICAgW1wicmVtb3ZlTGlua1wiLCBbXCJ3aW5kb3dcIixcIm15QXBwXCJdXSxcbiAgXVxuXVxuIiwiZXhwb3J0cy5jb2RlID0gYGZ1bmN0aW9uIGNyZWF0ZVRlbkVsZW1lbnRzKCkge1xuICB2YXIgYXJyYXkgPSBbXTtcblxuICBmb3IodmFyIGk9MDsgaSA8IDEwOyBpKyspIHtcbiAgICBhcnJheVtpXSA9IGk7XG4gIH1cblxuICByZXR1cm4gYXJyYXk7XG59XG5cbnZhciBteUFycmF5ID0gY3JlYXRlVGVuRWxlbWVudHMoKTtcbmBcblxuZXhwb3J0cy5zdGVwcyA9IFtcbiAgW1xuICAgIFtcImFkZE5vZGVcIiwge3R5cGU6IFwid2luZG93XCIsIGlkOiBcIndpbmRvd1wifV0sXG4gICAgW1wiYWRkTm9kZVwiLCB7dHlwZTogXCJjYWxsU3RhY2tcIiwgaWQ6IFwiY2FsbFN0YWNrXCJ9XSxcbiAgICAvLyBbXCJhZGRMaW5rXCIsIHtzb3VyY2U6IFwid2luZG93XCIsIHRhcmdldDogXCJjYWxsU3RhY2tcIiwgZGFzaGVkOiB0cnVlfV0sXG4gIF0sXG4gIFtcbiAgICBbXCJoaWdobGlnaHRcIiwgWzEsIDldXVxuICBdLFxuICBbXG4gICAgW1wiYWRkTm9kZVwiLCB7ZGlzcGxheTogXCJzY29wZVwiLCB0eXBlOiBcImZ1bmN0aW9uXCIsIGlkOiBcImNyZWF0ZVRlbkVsZW1lbnRzXCJ9XSxcbiAgICBbXCJhZGRMaW5rXCIsIHtzb3VyY2U6IFwiY2FsbFN0YWNrXCIsIHRhcmdldDogXCJjcmVhdGVUZW5FbGVtZW50c1wiLCBkaXNwbGF5OiBcImNyZWF0ZVRlbkVsZW1lbnRzXCJ9XSxcbiAgICBbXCJoaWdobGlnaHRcIiwgW1wiMTE6MTVcIiwgXCIxMTozNFwiXV1cbiAgXSxcbiAgW1xuICAgIFtcImFkZE5vZGVcIiwge2Rpc3BsYXk6IFwiWyBdXCIsIHR5cGU6IFwiYXJyYXlcIiwgaWQ6IFwiYXJyYXlcIn1dLFxuICAgIFtcImFkZExpbmtcIiwge2Rpc3BsYXk6IFwiYXJyYXlcIiwgc291cmNlOiBcImNyZWF0ZVRlbkVsZW1lbnRzXCIsIHRhcmdldDogXCJhcnJheVwifV0sXG4gICAgW1wiaGlnaGxpZ2h0XCIsIFtcIjI6M1wiLCBcIjI6MThcIl1dLFxuICBdLFxuICBbXG4gICAgW1wiaGlnaGxpZ2h0XCIsIFs0LCA2XV0sXG4gICAgW1wiYWRkTm9kZVwiLCB7ZGlzcGxheTogXCIgXCIsIHR5cGU6IFwidmFsdWVcIiwgaWQ6IFwiYXJyYXktMFwifV0sXG4gICAgW1wiYWRkTm9kZVwiLCB7ZGlzcGxheTogXCIgXCIsIHR5cGU6IFwidmFsdWVcIiwgaWQ6IFwiYXJyYXktMVwifV0sXG4gICAgW1wiYWRkTm9kZVwiLCB7ZGlzcGxheTogXCIgXCIsIHR5cGU6IFwidmFsdWVcIiwgaWQ6IFwiYXJyYXktMlwifV0sXG4gICAgW1wiYWRkTm9kZVwiLCB7ZGlzcGxheTogXCIgXCIsIHR5cGU6IFwidmFsdWVcIiwgaWQ6IFwiYXJyYXktM1wifV0sXG4gICAgW1wiYWRkTm9kZVwiLCB7ZGlzcGxheTogXCIgXCIsIHR5cGU6IFwidmFsdWVcIiwgaWQ6IFwiYXJyYXktNFwifV0sXG4gICAgW1wiYWRkTm9kZVwiLCB7ZGlzcGxheTogXCIgXCIsIHR5cGU6IFwidmFsdWVcIiwgaWQ6IFwiYXJyYXktNVwifV0sXG4gICAgW1wiYWRkTm9kZVwiLCB7ZGlzcGxheTogXCIgXCIsIHR5cGU6IFwidmFsdWVcIiwgaWQ6IFwiYXJyYXktNlwifV0sXG4gICAgW1wiYWRkTm9kZVwiLCB7ZGlzcGxheTogXCIgXCIsIHR5cGU6IFwidmFsdWVcIiwgaWQ6IFwiYXJyYXktN1wifV0sXG4gICAgW1wiYWRkTm9kZVwiLCB7ZGlzcGxheTogXCIgXCIsIHR5cGU6IFwidmFsdWVcIiwgaWQ6IFwiYXJyYXktOFwifV0sXG4gICAgW1wiYWRkTm9kZVwiLCB7ZGlzcGxheTogXCIgXCIsIHR5cGU6IFwidmFsdWVcIiwgaWQ6IFwiYXJyYXktOVwifV0sXG4gICAgW1wiYWRkTGlua1wiLCB7ZGlzcGxheTogXCIwXCIsIGRpc3RhbmNlOiAwLjEsIHNvdXJjZTogXCJhcnJheVwiLCB0YXJnZXQ6IFwiYXJyYXktMFwifV0sXG4gICAgW1wiYWRkTGlua1wiLCB7ZGlzcGxheTogXCIxXCIsIGRpc3RhbmNlOiAwLjEsIHNvdXJjZTogXCJhcnJheVwiLCB0YXJnZXQ6IFwiYXJyYXktMVwifV0sXG4gICAgW1wiYWRkTGlua1wiLCB7ZGlzcGxheTogXCIyXCIsIGRpc3RhbmNlOiAwLjEsIHNvdXJjZTogXCJhcnJheVwiLCB0YXJnZXQ6IFwiYXJyYXktMlwifV0sXG4gICAgW1wiYWRkTGlua1wiLCB7ZGlzcGxheTogXCIzXCIsIGRpc3RhbmNlOiAwLjEsIHNvdXJjZTogXCJhcnJheVwiLCB0YXJnZXQ6IFwiYXJyYXktM1wifV0sXG4gICAgW1wiYWRkTGlua1wiLCB7ZGlzcGxheTogXCI0XCIsIGRpc3RhbmNlOiAwLjEsIHNvdXJjZTogXCJhcnJheVwiLCB0YXJnZXQ6IFwiYXJyYXktNFwifV0sXG4gICAgW1wiYWRkTGlua1wiLCB7ZGlzcGxheTogXCI1XCIsIGRpc3RhbmNlOiAwLjEsIHNvdXJjZTogXCJhcnJheVwiLCB0YXJnZXQ6IFwiYXJyYXktNVwifV0sXG4gICAgW1wiYWRkTGlua1wiLCB7ZGlzcGxheTogXCI2XCIsIGRpc3RhbmNlOiAwLjEsIHNvdXJjZTogXCJhcnJheVwiLCB0YXJnZXQ6IFwiYXJyYXktNlwifV0sXG4gICAgW1wiYWRkTGlua1wiLCB7ZGlzcGxheTogXCI3XCIsIGRpc3RhbmNlOiAwLjEsIHNvdXJjZTogXCJhcnJheVwiLCB0YXJnZXQ6IFwiYXJyYXktN1wifV0sXG4gICAgW1wiYWRkTGlua1wiLCB7ZGlzcGxheTogXCI4XCIsIGRpc3RhbmNlOiAwLjEsIHNvdXJjZTogXCJhcnJheVwiLCB0YXJnZXQ6IFwiYXJyYXktOFwifV0sXG4gICAgW1wiYWRkTGlua1wiLCB7ZGlzcGxheTogXCI5XCIsIGRpc3RhbmNlOiAwLjEsIHNvdXJjZTogXCJhcnJheVwiLCB0YXJnZXQ6IFwiYXJyYXktOVwifV0sXG4gIF0sXG4gIFtcbiAgICBbXCJoaWdobGlnaHRcIiwgOF0sXG4gIF0sXG4gIFtcbiAgICBbXCJyZW1vdmVOb2RlXCIsIFwiY3JlYXRlVGVuRWxlbWVudHNcIl0sXG4gICAgLy8gW1wicmVtb3ZlTGlua1wiLCBbXCJjYWxsU3RhY2tcIiwgXCJjcmVhdGVUZW5FbGVtZW50c1wiXV0sXG4gICAgLy8gW1wicmVtb3ZlTGlua1wiLCBbXCJjcmVhdGVUZW5FbGVtZW50c1wiLCBcImFycmF5XCJdXSxcbiAgICBbXCJhZGRMaW5rXCIsIHtkaXNwbGF5OiBcIm15QXJyYXlcIiwgc291cmNlOiBcIndpbmRvd1wiLCB0YXJnZXQ6IFwiYXJyYXlcIn1dLFxuICAgIFtcImhpZ2hsaWdodFwiLCBbXCIxMToxXCIsIFwiMTE6MTJcIl1dXG4gIF1cbl1cbiIsImV4cG9ydHMuY29kZSA9IGBmdW5jdGlvbiBjcmVhdGVUZW5FbGVtZW50cygpIHtcbiAgdmFyIGFycmF5ID0gW107XG5cbiAgZm9yKHZhciBpPTA7IGkgPCAxMDsgaSsrKSB7XG4gICAgYXJyYXlbaV0gPSBpO1xuICB9XG59XG5cbmNyZWF0ZVRlbkVsZW1lbnRzKCk7XG5gXG5cbmV4cG9ydHMuc3RlcHMgPSBbXG4gIFtcbiAgICBbXCJhZGROb2RlXCIsIHt0eXBlOiBcIndpbmRvd1wiLCBpZDogXCJ3aW5kb3dcIn1dLFxuICAgIFtcImFkZE5vZGVcIiwge3R5cGU6IFwiY2FsbFN0YWNrXCIsIGlkOiBcImNhbGxTdGFja1wifV0sXG4gICAgLy8gW1wiYWRkTGlua1wiLCB7c291cmNlOiBcIndpbmRvd1wiLCB0YXJnZXQ6IFwiY2FsbFN0YWNrXCIsIGRhc2hlZDogdHJ1ZX1dLFxuICBdLFxuICBbXG4gICAgW1wiaGlnaGxpZ2h0XCIsIFsxLCA3XV1cbiAgXSxcbiAgW1xuICAgIFtcImFkZE5vZGVcIiwge2Rpc3BsYXk6IFwic2NvcGVcIiwgdHlwZTogXCJmdW5jdGlvblwiLCBpZDogXCJjcmVhdGVUZW5FbGVtZW50c1wifV0sXG4gICAgW1wiYWRkTGlua1wiLCB7c291cmNlOiBcImNhbGxTdGFja1wiLCB0YXJnZXQ6IFwiY3JlYXRlVGVuRWxlbWVudHNcIiwgZGlzcGxheTogXCJjcmVhdGVUZW5FbGVtZW50c1wifV0sXG4gICAgW1wiaGlnaGxpZ2h0XCIsIDldXG4gIF0sXG4gIFtcbiAgICBbXCJhZGROb2RlXCIsIHtkaXNwbGF5OiBcIlsgXVwiLCB0eXBlOiBcImFycmF5XCIsIGlkOiBcImFycmF5XCJ9XSxcbiAgICBbXCJhZGRMaW5rXCIsIHtkaXNwbGF5OiBcImFycmF5XCIsIHNvdXJjZTogXCJjcmVhdGVUZW5FbGVtZW50c1wiLCB0YXJnZXQ6IFwiYXJyYXlcIn1dLFxuICAgIFtcImhpZ2hsaWdodFwiLCBbXCIyOjNcIiwgXCIyOjE4XCJdXSxcbiAgXSxcbiAgW1xuICAgIFtcImhpZ2hsaWdodFwiLCBbNCwgNl1dLFxuICAgIFtcImFkZE5vZGVcIiwge2Rpc3BsYXk6IFwiIFwiLCB0eXBlOiBcInZhbHVlXCIsIGlkOiBcImFycmF5LTBcIn1dLFxuICAgIFtcImFkZE5vZGVcIiwge2Rpc3BsYXk6IFwiIFwiLCB0eXBlOiBcInZhbHVlXCIsIGlkOiBcImFycmF5LTFcIn1dLFxuICAgIFtcImFkZE5vZGVcIiwge2Rpc3BsYXk6IFwiIFwiLCB0eXBlOiBcInZhbHVlXCIsIGlkOiBcImFycmF5LTJcIn1dLFxuICAgIFtcImFkZE5vZGVcIiwge2Rpc3BsYXk6IFwiIFwiLCB0eXBlOiBcInZhbHVlXCIsIGlkOiBcImFycmF5LTNcIn1dLFxuICAgIFtcImFkZE5vZGVcIiwge2Rpc3BsYXk6IFwiIFwiLCB0eXBlOiBcInZhbHVlXCIsIGlkOiBcImFycmF5LTRcIn1dLFxuICAgIFtcImFkZE5vZGVcIiwge2Rpc3BsYXk6IFwiIFwiLCB0eXBlOiBcInZhbHVlXCIsIGlkOiBcImFycmF5LTVcIn1dLFxuICAgIFtcImFkZE5vZGVcIiwge2Rpc3BsYXk6IFwiIFwiLCB0eXBlOiBcInZhbHVlXCIsIGlkOiBcImFycmF5LTZcIn1dLFxuICAgIFtcImFkZE5vZGVcIiwge2Rpc3BsYXk6IFwiIFwiLCB0eXBlOiBcInZhbHVlXCIsIGlkOiBcImFycmF5LTdcIn1dLFxuICAgIFtcImFkZE5vZGVcIiwge2Rpc3BsYXk6IFwiIFwiLCB0eXBlOiBcInZhbHVlXCIsIGlkOiBcImFycmF5LThcIn1dLFxuICAgIFtcImFkZE5vZGVcIiwge2Rpc3BsYXk6IFwiIFwiLCB0eXBlOiBcInZhbHVlXCIsIGlkOiBcImFycmF5LTlcIn1dLFxuICAgIFtcImFkZExpbmtcIiwge2Rpc3BsYXk6IFwiMFwiLCBkaXN0YW5jZTogMC4xLCBzb3VyY2U6IFwiYXJyYXlcIiwgdGFyZ2V0OiBcImFycmF5LTBcIn1dLFxuICAgIFtcImFkZExpbmtcIiwge2Rpc3BsYXk6IFwiMVwiLCBkaXN0YW5jZTogMC4xLCBzb3VyY2U6IFwiYXJyYXlcIiwgdGFyZ2V0OiBcImFycmF5LTFcIn1dLFxuICAgIFtcImFkZExpbmtcIiwge2Rpc3BsYXk6IFwiMlwiLCBkaXN0YW5jZTogMC4xLCBzb3VyY2U6IFwiYXJyYXlcIiwgdGFyZ2V0OiBcImFycmF5LTJcIn1dLFxuICAgIFtcImFkZExpbmtcIiwge2Rpc3BsYXk6IFwiM1wiLCBkaXN0YW5jZTogMC4xLCBzb3VyY2U6IFwiYXJyYXlcIiwgdGFyZ2V0OiBcImFycmF5LTNcIn1dLFxuICAgIFtcImFkZExpbmtcIiwge2Rpc3BsYXk6IFwiNFwiLCBkaXN0YW5jZTogMC4xLCBzb3VyY2U6IFwiYXJyYXlcIiwgdGFyZ2V0OiBcImFycmF5LTRcIn1dLFxuICAgIFtcImFkZExpbmtcIiwge2Rpc3BsYXk6IFwiNVwiLCBkaXN0YW5jZTogMC4xLCBzb3VyY2U6IFwiYXJyYXlcIiwgdGFyZ2V0OiBcImFycmF5LTVcIn1dLFxuICAgIFtcImFkZExpbmtcIiwge2Rpc3BsYXk6IFwiNlwiLCBkaXN0YW5jZTogMC4xLCBzb3VyY2U6IFwiYXJyYXlcIiwgdGFyZ2V0OiBcImFycmF5LTZcIn1dLFxuICAgIFtcImFkZExpbmtcIiwge2Rpc3BsYXk6IFwiN1wiLCBkaXN0YW5jZTogMC4xLCBzb3VyY2U6IFwiYXJyYXlcIiwgdGFyZ2V0OiBcImFycmF5LTdcIn1dLFxuICAgIFtcImFkZExpbmtcIiwge2Rpc3BsYXk6IFwiOFwiLCBkaXN0YW5jZTogMC4xLCBzb3VyY2U6IFwiYXJyYXlcIiwgdGFyZ2V0OiBcImFycmF5LThcIn1dLFxuICAgIFtcImFkZExpbmtcIiwge2Rpc3BsYXk6IFwiOVwiLCBkaXN0YW5jZTogMC4xLCBzb3VyY2U6IFwiYXJyYXlcIiwgdGFyZ2V0OiBcImFycmF5LTlcIn1dLFxuICBdLFxuICBbXG4gICAgW1wicmVtb3ZlTm9kZVwiLCBcImNyZWF0ZVRlbkVsZW1lbnRzXCJdLFxuICBdLFxuICBbXG4gICAgW1wicmVtb3ZlTm9kZVwiLCBcImFycmF5XCJdLFxuICAgIFtcInJlbW92ZU5vZGVcIiwgXCJhcnJheS0wXCJdLFxuICAgIFtcInJlbW92ZU5vZGVcIiwgXCJhcnJheS0xXCJdLFxuICAgIFtcInJlbW92ZU5vZGVcIiwgXCJhcnJheS0yXCJdLFxuICAgIFtcInJlbW92ZU5vZGVcIiwgXCJhcnJheS0zXCJdLFxuICAgIFtcInJlbW92ZU5vZGVcIiwgXCJhcnJheS00XCJdLFxuICAgIFtcInJlbW92ZU5vZGVcIiwgXCJhcnJheS01XCJdLFxuICAgIFtcInJlbW92ZU5vZGVcIiwgXCJhcnJheS02XCJdLFxuICAgIFtcInJlbW92ZU5vZGVcIiwgXCJhcnJheS03XCJdLFxuICAgIFtcInJlbW92ZU5vZGVcIiwgXCJhcnJheS04XCJdLFxuICAgIFtcInJlbW92ZU5vZGVcIiwgXCJhcnJheS05XCJdLFxuICBdXG5dXG4iLCJleHBvcnRzLmNvZGUgPSBgdmFyIHNvbWVMaXN0ID0gW107XG5cbnZhciBvYmoxID0geyBsaW5rOiBzb21lTGlzdCB9O1xudmFyIG9iajIgPSB7IGxpbms6IHNvbWVMaXN0IH07XG52YXIgb2JqMyA9IHsgbGluazogc29tZUxpc3QgfTtcbnZhciBvYmo0ID0geyBsaW5rOiBzb21lTGlzdCB9O1xuXG5vYmoxID0gdW5kZWZpbmVkO1xub2JqMiA9IHVuZGVmaW5lZDtcbm9iajMgPSB1bmRlZmluZWQ7XG5vYmo0ID0gdW5kZWZpbmVkO1xuYFxuXG5leHBvcnRzLnN0ZXBzID0gW1xuICBbXG4gICAgW1wiYWRkTm9kZVwiLCB7dHlwZTogXCJ3aW5kb3dcIiwgaWQ6IFwid2luZG93XCJ9XSxcbiAgXSxcbiAgW1xuICAgIFtcImFkZE5vZGVcIiwge2Rpc3BsYXk6IFwiWyBdXCIsIHR5cGU6IFwiYXJyYXlcIiwgaWQ6IFwic29tZUxpc3RcIn1dLFxuICAgIFtcImFkZExpbmtcIiwge3NvdXJjZTogXCJ3aW5kb3dcIiwgdGFyZ2V0Olwic29tZUxpc3RcIiwgZGlzcGxheTogXCJzb21lTGlzdFwiLCBkaXN0YW5jZTogM31dLFxuICAgIFtcImhpZ2hsaWdodFwiLCAxXSxcbiAgXSxcbiAgW1xuICAgIFtcImFkZE5vZGVcIiwge2Rpc3BsYXk6IFwieyB9XCIsIHR5cGU6IFwib2JqZWN0XCIsIGlkOiBcIm9iajFcIn1dLFxuICAgIFtcImFkZExpbmtcIiwge3NvdXJjZTogXCJvYmoxXCIsIHRhcmdldDogXCJzb21lTGlzdFwiLCBkaXNwbGF5OiBcImxpbmtcIn1dLFxuICAgIFtcImFkZExpbmtcIiwge3NvdXJjZTogXCJ3aW5kb3dcIiwgdGFyZ2V0Olwib2JqMVwiLCBkaXNwbGF5OiBcIm9iajFcIn1dLFxuICAgIFtcImhpZ2hsaWdodFwiLCAzXSxcbiAgXSxcbiAgW1xuICAgIFtcImFkZE5vZGVcIiwge2Rpc3BsYXk6IFwieyB9XCIsIHR5cGU6IFwib2JqZWN0XCIsIGlkOiBcIm9iajJcIn1dLFxuICAgIFtcImFkZExpbmtcIiwge3NvdXJjZTogXCJvYmoyXCIsIHRhcmdldDogXCJzb21lTGlzdFwiLCBkaXNwbGF5OiBcImxpbmtcIn1dLFxuICAgIFtcImFkZExpbmtcIiwge3NvdXJjZTogXCJ3aW5kb3dcIiwgdGFyZ2V0Olwib2JqMlwiLCBkaXNwbGF5OiBcIm9iajJcIn1dLFxuICAgIFtcImhpZ2hsaWdodFwiLCA0XSxcbiAgXSxcbiAgW1xuICAgIFtcImFkZE5vZGVcIiwge2Rpc3BsYXk6IFwieyB9XCIsIHR5cGU6IFwib2JqZWN0XCIsIGlkOiBcIm9iajNcIn1dLFxuICAgIFtcImFkZExpbmtcIiwge3NvdXJjZTogXCJvYmozXCIsIHRhcmdldDogXCJzb21lTGlzdFwiLCBkaXNwbGF5OiBcImxpbmtcIn1dLFxuICAgIFtcImFkZExpbmtcIiwge3NvdXJjZTogXCJ3aW5kb3dcIiwgdGFyZ2V0Olwib2JqM1wiLCBkaXNwbGF5OiBcIm9iajNcIn1dLFxuICAgIFtcImhpZ2hsaWdodFwiLCA1XSxcbiAgXSxcbiAgW1xuICAgIFtcImFkZE5vZGVcIiwge2Rpc3BsYXk6IFwieyB9XCIsIHR5cGU6IFwib2JqZWN0XCIsIGlkOiBcIm9iajRcIn1dLFxuICAgIFtcImFkZExpbmtcIiwge3NvdXJjZTogXCJvYmo0XCIsIHRhcmdldDogXCJzb21lTGlzdFwiLCBkaXNwbGF5OiBcImxpbmtcIn1dLFxuICAgIFtcImFkZExpbmtcIiwge3NvdXJjZTogXCJ3aW5kb3dcIiwgdGFyZ2V0Olwib2JqNFwiLCBkaXNwbGF5OiBcIm9iajRcIn1dLFxuICAgIFtcImhpZ2hsaWdodFwiLCA2XSxcbiAgXSxcbiAgW1xuICAgIFtcInJlbW92ZUxpbmtcIiwgW1wid2luZG93XCIsIFwib2JqMVwiXV0sXG4gICAgW1wiaGlnaGxpZ2h0XCIsIDhdLFxuICBdLFxuICBbXG4gICAgW1wicmVtb3ZlTGlua1wiLCBbXCJ3aW5kb3dcIiwgXCJvYmoyXCJdXSxcbiAgICBbXCJoaWdobGlnaHRcIiwgOV0sXG4gIF0sXG4gIFtcbiAgICBbXCJyZW1vdmVMaW5rXCIsIFtcIndpbmRvd1wiLCBcIm9iajNcIl1dLFxuICAgIFtcImhpZ2hsaWdodFwiLCAxMF0sXG4gIF0sXG4gIFtcbiAgICBbXCJyZW1vdmVMaW5rXCIsIFtcIndpbmRvd1wiLCBcIm9iajRcIl1dLFxuICAgIFtcImhpZ2hsaWdodFwiLCAxMV0sXG4gIF0sXG4gIFtcbiAgICBbXCJyZW1vdmVOb2RlXCIsIFwib2JqMVwiXSxcbiAgXSxcbiAgW1xuICAgIFtcInJlbW92ZU5vZGVcIiwgXCJvYmoyXCJdLFxuICBdLFxuICBbXG4gICAgW1wicmVtb3ZlTm9kZVwiLCBcIm9iajNcIl0sXG4gIF0sXG4gIFtcbiAgICBbXCJyZW1vdmVOb2RlXCIsIFwib2JqNFwiXSxcbiAgXVxuXVxuIiwiZXhwb3J0cy5jb2RlID0gYGZ1bmN0aW9uIGNyZWF0ZUxvZ2dlcigpIHtcbiAgdmFyIG1lc3NhZ2VzID0gW107XG5cbiAgcmV0dXJuIGZ1bmN0aW9uIGxvZ2dlcihtZXNzYWdlKSB7XG4gICAgbWVzc2FnZXMucHVzaChtZXNzYWdlKTtcbiAgICBjb25zb2xlLmxvZyhtZXNzYWdlcyk7XG4gIH1cbn1cblxudmFyIGNhcHRhaW5zTG9nID0gY3JlYXRlTG9nZ2VyKCk7XG52YXIgYm9zdW5zTG9nID0gY3JlYXRlTG9nZ2VyKCk7XG5cbmNhcHRhaW5zTG9nKFwiQ2FwdGFpbidzIGxvZ1wiKTtcbmNhcHRhaW5zTG9nKFwiU3VwcGxlbWVudGFsXCIpO1xuXG5ib3N1bnNMb2coXCJCb3N1biBpcyBzaG9ydCBmb3IgYm9hdHN3YWluLlwiKVxuYm9zdW5zTG9nKFwiU3dhYiB0aGUgZGVjayBtYXRleS5cIilcblxuY2FwdGFpbnNMb2cgPSB1bmRlZmluZWRcbmJvc3Vuc0xvZyA9IHVuZGVmaW5lZFxuYFxuXG5leHBvcnRzLnN0ZXBzID0gW1xuICBbXG4gICAgW1wiYWRkTm9kZVwiLCB7dHlwZTogXCJ3aW5kb3dcIiwgaWQ6IFwid2luZG93XCJ9XSxcbiAgXSxcbiAgW1xuICAgIC8vIGZ1bmN0aW9uIGRlZmluaXRpb25cbiAgICBbXCJoaWdobGlnaHRcIiwgWzEsOF1dLFxuICBdLFxuICBbXG4gICAgLy8gY3JlYXRlTG9nZ2VyKClcbiAgICBbXCJhZGROb2RlXCIsIHt0eXBlOiBcImNhbGxTdGFja1wiLCBpZDogXCJjYWxsU3RhY2tcIn1dLFxuICAgIFtcImhpZ2hsaWdodFwiLCBbXCIxMDoxOVwiLCBcIjEwOjMzXCJdXSxcbiAgXSxcbiAgW1xuICAgIC8vIGZ1bmN0aW9uIGJsb2NrXG4gICAgW1wiYWRkTm9kZVwiLCB7ZGlzcGxheTogXCJzY29wZVwiLCB0eXBlOiBcImZ1bmN0aW9uXCIsIGlkOiBcImNyZWF0ZUxvZ2dlclwifV0sXG4gICAgW1wiYWRkTGlua1wiLCB7c291cmNlOiBcImNhbGxTdGFja1wiLCB0YXJnZXQ6IFwiY3JlYXRlTG9nZ2VyXCIsIGRpc3BsYXk6IFwiY3JlYXRlTG9nZ2VyXCJ9XSxcbiAgICBbXCJoaWdobGlnaHRcIiwgWzIsIDddXSxcbiAgXSxcbiAgW1xuICAgIC8vIHZhciBtZXNzYWdlcyA9IFtdXG4gICAgW1wiYWRkTm9kZVwiLCB7ZGlzcGxheTogXCJbIF1cIiwgdHlwZTogXCJhcnJheVwiLCBpZDogXCJtZXNzYWdlczFcIn1dLFxuICAgIFtcImFkZExpbmtcIiwge3NvdXJjZTogXCJjcmVhdGVMb2dnZXJcIiwgdGFyZ2V0OiBcIm1lc3NhZ2VzMVwiLCBkaXNwbGF5OiBcIm1lc3NhZ2VzXCJ9XSxcbiAgICBbXCJoaWdobGlnaHRcIiwgMl0sXG4gIF0sXG4gIFtcbiAgICAvLyBmdW5jdGlvbiBsb2dnZXIoKSB7fVxuICAgIFtcImFkZE5vZGVcIiwge2Rpc3BsYXk6IFwiZm5cIiwgdHlwZTogXCJmdW5jdGlvblwiLCBpZDogXCJjYXB0YWluc0xvZ1wifV0sXG4gICAgW1wiYWRkTGlua1wiLCB7c291cmNlOiBcImNyZWF0ZUxvZ2dlclwiLCB0YXJnZXQ6IFwiY2FwdGFpbnNMb2dcIiwgZGlzcGxheTogXCJsb2dnZXJcIn1dLFxuICAgIFtcImhpZ2hsaWdodFwiLCBbXCI0OjEwXCIsIFwiNzo0XCJdXSxcbiAgXSxcbiAgW1xuICAgIC8vIG1lc3NhZ2VzXG4gICAgW1wiYWRkTGlua1wiLCB7c291cmNlOiBcImNhcHRhaW5zTG9nXCIsIHRhcmdldDogXCJtZXNzYWdlczFcIiwgZGlzcGxheTogXCJtZXNzYWdlc1wifV0sXG4gICAgW1wiaGlnaGxpZ2h0XCIsIFtcIjU6NVwiLCBcIjU6MTNcIl1dLFxuICBdLFxuICBbXG4gICAgLy8gcmV0dXJuXG4gICAgW1wicmVtb3ZlTm9kZVwiLCBcImNyZWF0ZUxvZ2dlclwiXSxcbiAgICBbXCJyZW1vdmVOb2RlXCIsIFwiY2FsbFN0YWNrXCJdLFxuICAgIFtcImhpZ2hsaWdodFwiLCBbXCI0OjNcIiwgXCI0OjlcIl1dLFxuICBdLFxuICBbXG4gICAgLy8gdmFyIGNhcHRhaW5zTG9nXG4gICAgW1wiYWRkTGlua1wiLCB7c291cmNlOiBcIndpbmRvd1wiLCB0YXJnZXQ6IFwiY2FwdGFpbnNMb2dcIiwgZGlzcGxheTogXCJjYXB0YWluc0xvZ1wifV0sXG4gICAgW1wiaGlnaGxpZ2h0XCIsIFtcIjEwOjFcIiwgXCIxMDoxNlwiXV0sXG4gIF0sXG4gIFtcbiAgICAvLyB2YXIgYm9zdW5zTG9nID0gY3JlYXRlTG9nZ2VyKClcbiAgICBbXCJhZGROb2RlXCIsIHtkaXNwbGF5OiBcIlsgXVwiLCB0eXBlOiBcImFycmF5XCIsIGlkOiBcIm1lc3NhZ2VzMlwifV0sXG4gICAgW1wiYWRkTm9kZVwiLCB7ZGlzcGxheTogXCJmblwiLCB0eXBlOiBcImZ1bmN0aW9uXCIsIGlkOiBcImJvc3Vuc0xvZ1wifV0sXG4gICAgW1wiYWRkTGlua1wiLCB7c291cmNlOiBcIndpbmRvd1wiLCB0YXJnZXQ6IFwiYm9zdW5zTG9nXCIsIGRpc3BsYXk6IFwiYm9uc3Vuc0xvZ1wifV0sXG4gICAgW1wiYWRkTGlua1wiLCB7c291cmNlOiBcImJvc3Vuc0xvZ1wiLCB0YXJnZXQ6IFwibWVzc2FnZXMyXCIsIGRpc3BsYXk6IFwibWVzc2FnZXNcIn1dLFxuICAgIFtcImhpZ2hsaWdodFwiLCAxMV0sXG4gIF0sXG4gIFtcbiAgICAvLyBjYXB0YWluc0xvZyhcIkNhcHRhaW4ncyBsb2dcIilcbiAgICBbXCJoaWdobGlnaHRcIiwgMTNdLFxuICBdLFxuICBbXG4gICAgLy8gbWVzc2FnZXMucHVzaChtZXNzYWdlKVxuICAgIFtcImFkZE5vZGVcIiwge2Rpc3BsYXk6ICdcIkNhcHRhaW5cXCdzIGxvZ1wiJywgdHlwZTogXCJ2YWx1ZVwiLCBpZDogXCJzdHJpbmcxXCJ9XSxcbiAgICBbXCJhZGRMaW5rXCIsIHtzb3VyY2U6IFwibWVzc2FnZXMxXCIsIHRhcmdldDogXCJzdHJpbmcxXCJ9XSxcbiAgICBbXCJoaWdobGlnaHRcIiwgNV0sXG4gIF0sXG4gIFtcbiAgICAvLyBjb25zb2xlLmxvZyhtZXNzYWdlcylcbiAgICBbXCJoaWdobGlnaHRcIiwgNl0sXG4gIF0sXG4gIFtcbiAgICAvLyBjYXB0YWluc0xvZyhcIlN1cHBsZW1lbnRhbFwiKTtcbiAgICBbXCJhZGROb2RlXCIsIHtkaXNwbGF5OiAnXCJTdXBwbGVtZW50YWxcIicsIHR5cGU6IFwidmFsdWVcIiwgaWQ6IFwic3RyaW5nMlwifV0sXG4gICAgW1wiYWRkTGlua1wiLCB7c291cmNlOiBcIm1lc3NhZ2VzMVwiLCB0YXJnZXQ6IFwic3RyaW5nMlwifV0sXG4gICAgW1wiaGlnaGxpZ2h0XCIsIDE0XSxcbiAgXSxcbiAgW1xuICAgIC8vIGJvc3Vuc0xvZyhcIkJvc3VuIGlzIHNob3J0IGZvciBib3Rzd2Fpbi5cIilcbiAgICBbXCJoaWdobGlnaHRcIiwgMTZdLFxuICAgIFtcImFkZE5vZGVcIiwge2Rpc3BsYXk6ICdcIkJvc3VuIGlzLi4uXCInLCB0eXBlOiBcInZhbHVlXCIsIGlkOiBcInN0cmluZzNcIn1dLFxuICAgIFtcImFkZExpbmtcIiwge3NvdXJjZTogXCJtZXNzYWdlczJcIiwgdGFyZ2V0OiBcInN0cmluZzNcIn1dLFxuICBdLFxuICBbXG4gICAgLy8gYm9zdW5zTG9nKFwiU3dhYiB0aGUgZGVja1wiKVxuICAgIFtcImhpZ2hsaWdodFwiLCAxN10sXG4gICAgW1wiYWRkTm9kZVwiLCB7ZGlzcGxheTogJ1wiU3dhYiB0aGUgZGVjay4uLlwiJywgdHlwZTogXCJ2YWx1ZVwiLCBpZDogXCJzdHJpbmc0XCJ9XSxcbiAgICBbXCJhZGRMaW5rXCIsIHtzb3VyY2U6IFwibWVzc2FnZXMyXCIsIHRhcmdldDogXCJzdHJpbmc0XCJ9XSxcbiAgXSxcbiAgW1xuICAgIC8vIGNhcHRhaW5zTG9nID0gdW5kZWZpbmVkXG4gICAgW1wiaGlnaGxpZ2h0XCIsIDE5XSxcbiAgICBbXCJyZW1vdmVMaW5rXCIsIFtcIndpbmRvd1wiLCBcImNhcHRhaW5zTG9nXCJdXSxcbiAgXSxcbiAgW1xuICAgIC8vIGJvc3Vuc0xvZyA9IHVuZGVmaW5lZFxuICAgIFtcImhpZ2hsaWdodFwiLCAyMF0sXG4gICAgW1wicmVtb3ZlTGlua1wiLCBbXCJ3aW5kb3dcIiwgXCJib3N1bnNMb2dcIl1dLFxuICBdLFxuICBbXG4gICAgW1wicmVtb3ZlTm9kZVwiLCBcImNhcHRhaW5zTG9nXCJdLFxuICAgIFtcInJlbW92ZU5vZGVcIiwgXCJib3N1bnNMb2dcIl0sXG4gICAgW1wicmVtb3ZlTm9kZVwiLCBcInN0cmluZzFcIl0sXG4gICAgW1wicmVtb3ZlTm9kZVwiLCBcInN0cmluZzJcIl0sXG4gICAgW1wicmVtb3ZlTm9kZVwiLCBcInN0cmluZzNcIl0sXG4gICAgW1wicmVtb3ZlTm9kZVwiLCBcInN0cmluZzRcIl0sXG4gICAgW1wicmVtb3ZlTm9kZVwiLCBcIm1lc3NhZ2VzMVwiXSxcbiAgICBbXCJyZW1vdmVOb2RlXCIsIFwibWVzc2FnZXMyXCJdLFxuICBdLFxuXVxuIiwiZXhwb3J0cy5jb2RlID0gYGZ1bmN0aW9uIENsaWNrQ291bnRlcigpIHtcbiAgdGhpcy5jb3VudENsaWNrcyA9IDA7XG4gIHZhciBzY29wZSA9IHRoaXM7XG4gIHRoaXMuaGFuZGxlciA9IGZ1bmN0aW9uIGJ1dHRvbkNsaWNrKCkge1xuICAgIHNjb3BlLmNvdW50Q2xpY2tzKys7XG4gIH07XG5cbiAgJCgnYnV0dG9uJykub24oJ2NsaWNrJywgdGhpcy5oYW5kbGVyKTtcbn1cblxuQ2xpY2tDb3VudGVyLnByb3RvdHlwZS5kZXN0cm95ID0gZnVuY3Rpb24oKSB7XG4gICQoJ2J1dHRvbicpLm9mZignY2xpY2snLCB0aGlzLmhhbmRsZXIpO1xufVxuXG52YXIgY2xpY2tDb3VudGVyMSA9IG5ldyBDbGlja0NvdW50ZXIoKTtcbnZhciBjbGlja0NvdW50ZXIyID0gbmV3IENsaWNrQ291bnRlcigpO1xudmFyIGNsaWNrQ291bnRlcjMgPSBuZXcgQ2xpY2tDb3VudGVyKCk7XG5cbi8vIFN0b3AgZXhlY3V0aW9uLCB0aGVuIGxhdGVyIHJ1bjpcblxuY2xpY2tDb3VudGVyMS5kZXN0cm95KCk7XG5jbGlja0NvdW50ZXIyLmRlc3Ryb3koKTtcbmNsaWNrQ291bnRlcjMuZGVzdHJveSgpO1xuXG5kZWxldGUgY2xpY2tDb3VudGVyMTtcbmRlbGV0ZSBjbGlja0NvdW50ZXIyO1xuZGVsZXRlIGNsaWNrQ291bnRlcjM7XG5gXG5cbmV4cG9ydHMuc3RlcHMgPSBbXG4gIFtcbiAgICBbXCJhZGROb2RlXCIsIHt0eXBlOiBcIndpbmRvd1wiLCBpZDogXCJ3aW5kb3dcIn1dLFxuICAgIFtcImFkZE5vZGVcIiwge2Rpc3BsYXk6IFwiYnV0dG9uXCIsIHR5cGU6IFwib2JqZWN0XCIsIGlkOiBcImJ1dHRvblwifV0sXG4gICAgW1wiYWRkTGlua1wiLCB7c291cmNlOiBcIndpbmRvd1wiLCB0YXJnZXQ6IFwiYnV0dG9uXCIsIGRhc2hlZDogdHJ1ZX1dLFxuXG4gICAgLy8gY2xpY2tDb3VudGVyMVxuICAgIFtcImFkZE5vZGVcIiwge2Rpc3BsYXk6IFwiY2xpY2tDb3VudGVyMVwiLCB0eXBlOiBcIm9iamVjdFwiLCBpZDogXCJjbGlja0NvdW50ZXIxXCJ9XSxcbiAgICBbXCJhZGROb2RlXCIsIHtkaXNwbGF5OiBcImJ1dHRvbkNsaWNrXCIsIHR5cGU6IFwiZnVuY3Rpb25cIiwgaWQ6IFwiYnV0dG9uQ2xpY2sxXCJ9XSxcbiAgICBbXCJhZGRMaW5rXCIsIHtzb3VyY2U6IFwid2luZG93XCIsIHRhcmdldDogXCJjbGlja0NvdW50ZXIxXCJ9XSxcbiAgICBbXCJhZGRMaW5rXCIsIHtzb3VyY2U6IFwiYnV0dG9uQ2xpY2sxXCIsIHRhcmdldDogXCJjbGlja0NvdW50ZXIxXCJ9XSxcbiAgICBbXCJhZGRMaW5rXCIsIHtzb3VyY2U6IFwiYnV0dG9uXCIsIHRhcmdldDogXCJidXR0b25DbGljazFcIn1dLFxuXG4gICAgLy8gY2xpY2tDb3VudGVyMlxuICAgIFtcImFkZE5vZGVcIiwge2Rpc3BsYXk6IFwiY2xpY2tDb3VudGVyMlwiLCB0eXBlOiBcIm9iamVjdFwiLCBpZDogXCJjbGlja0NvdW50ZXIyXCJ9XSxcbiAgICBbXCJhZGROb2RlXCIsIHtkaXNwbGF5OiBcImJ1dHRvbkNsaWNrXCIsIHR5cGU6IFwiZnVuY3Rpb25cIiwgaWQ6IFwiYnV0dG9uQ2xpY2syXCJ9XSxcbiAgICBbXCJhZGRMaW5rXCIsIHtzb3VyY2U6IFwid2luZG93XCIsIHRhcmdldDogXCJjbGlja0NvdW50ZXIyXCJ9XSxcbiAgICBbXCJhZGRMaW5rXCIsIHtzb3VyY2U6IFwiYnV0dG9uQ2xpY2syXCIsIHRhcmdldDogXCJjbGlja0NvdW50ZXIyXCJ9XSxcbiAgICBbXCJhZGRMaW5rXCIsIHtzb3VyY2U6IFwiYnV0dG9uXCIsIHRhcmdldDogXCJidXR0b25DbGljazJcIn1dLFxuXG4gICAgLy8gY2xpY2tDb3VudGVyM1xuICAgIFtcImFkZE5vZGVcIiwge2Rpc3BsYXk6IFwiY2xpY2tDb3VudGVyM1wiLCB0eXBlOiBcIm9iamVjdFwiLCBpZDogXCJjbGlja0NvdW50ZXIzXCJ9XSxcbiAgICBbXCJhZGROb2RlXCIsIHtkaXNwbGF5OiBcImJ1dHRvbkNsaWNrXCIsIHR5cGU6IFwiZnVuY3Rpb25cIiwgaWQ6IFwiYnV0dG9uQ2xpY2szXCJ9XSxcbiAgICBbXCJhZGRMaW5rXCIsIHtzb3VyY2U6IFwid2luZG93XCIsIHRhcmdldDogXCJjbGlja0NvdW50ZXIzXCJ9XSxcbiAgICBbXCJhZGRMaW5rXCIsIHtzb3VyY2U6IFwiYnV0dG9uQ2xpY2szXCIsIHRhcmdldDogXCJjbGlja0NvdW50ZXIzXCJ9XSxcbiAgICBbXCJhZGRMaW5rXCIsIHtzb3VyY2U6IFwiYnV0dG9uXCIsIHRhcmdldDogXCJidXR0b25DbGljazNcIn1dLFxuICAgIFtcImhpZ2hsaWdodFwiLCAxOV0sXG4gIF0sXG4gIFtcbiAgICBbXCJyZW1vdmVMaW5rXCIsIFtcImJ1dHRvblwiLCBcImJ1dHRvbkNsaWNrMVwiXV0sXG4gICAgW1wiaGlnaGxpZ2h0XCIsIDIxXSxcbiAgXSxcbiAgW1xuICAgIFtcInJlbW92ZUxpbmtcIiwgW1wiYnV0dG9uXCIsIFwiYnV0dG9uQ2xpY2syXCJdXSxcbiAgICBbXCJoaWdobGlnaHRcIiwgMjJdLFxuICBdLFxuICBbXG4gICAgW1wicmVtb3ZlTGlua1wiLCBbXCJidXR0b25cIiwgXCJidXR0b25DbGljazNcIl1dLFxuICAgIFtcImhpZ2hsaWdodFwiLCAyM10sXG4gIF0sXG4gIFtcbiAgICBbXCJyZW1vdmVMaW5rXCIsIFtcIndpbmRvd1wiLCBcImNsaWNrQ291bnRlcjFcIl1dLFxuICAgIFtcImhpZ2hsaWdodFwiLCAyNV0sXG4gIF0sXG4gIFtcbiAgICBbXCJyZW1vdmVMaW5rXCIsIFtcIndpbmRvd1wiLCBcImNsaWNrQ291bnRlcjJcIl1dLFxuICAgIFtcImhpZ2hsaWdodFwiLCAyNl0sXG4gIF0sXG4gIFtcbiAgICBbXCJyZW1vdmVMaW5rXCIsIFtcIndpbmRvd1wiLCBcImNsaWNrQ291bnRlcjNcIl1dLFxuICAgIFtcImhpZ2hsaWdodFwiLCAyN10sXG4gIF0sXG4gIFtcbiAgICBbXCJyZW1vdmVOb2RlXCIsIFwiY2xpY2tDb3VudGVyMVwiXSxcbiAgICBbXCJyZW1vdmVOb2RlXCIsIFwiYnV0dG9uQ2xpY2sxXCJdLFxuICBdLFxuICBbXG4gICAgW1wicmVtb3ZlTm9kZVwiLCBcImNsaWNrQ291bnRlcjJcIl0sXG4gICAgW1wicmVtb3ZlTm9kZVwiLCBcImJ1dHRvbkNsaWNrMlwiXSxcbiAgXSxcbiAgW1xuICAgIFtcInJlbW92ZU5vZGVcIiwgXCJjbGlja0NvdW50ZXIzXCJdLFxuICAgIFtcInJlbW92ZU5vZGVcIiwgXCJidXR0b25DbGljazNcIl0sXG4gIF1cbl1cbiIsImV4cG9ydHMuY29kZSA9IGBmdW5jdGlvbiBDbGlja0NvdW50ZXIoKSB7XG4gIHRoaXMuY291bnRDbGlja3MgPSAwO1xuXG4gIHZhciBzY29wZSA9IHRoaXM7XG4gICQoJ2J1dHRvbicpLmNsaWNrKGZ1bmN0aW9uIGJ1dHRvbkNsaWNrKCkge1xuICAgIHNjb3BlLmNvdW50Q2xpY2tzKys7XG4gIH0pO1xufVxuXG52YXIgY2xpY2tDb3VudGVyMSA9IG5ldyBDbGlja0NvdW50ZXIoKTtcbnZhciBjbGlja0NvdW50ZXIyID0gbmV3IENsaWNrQ291bnRlcigpO1xudmFyIGNsaWNrQ291bnRlcjMgPSBuZXcgQ2xpY2tDb3VudGVyKCk7XG5cbi8vIFN0b3AgZXhlY3V0aW9uLCB0aGVuIGxhdGVyIHJ1bjpcblxuY2xpY2tDb3VudGVyMSA9IHVuZGVmaW5lZDtcbmNsaWNrQ291bnRlcjIgPSB1bmRlZmluZWQ7XG5jbGlja0NvdW50ZXIzID0gdW5kZWZpbmVkO1xuYFxuXG5leHBvcnRzLnN0ZXBzID0gW1xuICBbXG4gICAgW1wiYWRkTm9kZVwiLCB7dHlwZTogXCJ3aW5kb3dcIiwgaWQ6IFwid2luZG93XCJ9XSxcbiAgICBbXCJhZGROb2RlXCIsIHtkaXNwbGF5OiBcImJ1dHRvblwiLCB0eXBlOiBcIm9iamVjdFwiLCBpZDogXCJidXR0b25cIn1dLFxuICAgIFtcImFkZExpbmtcIiwge3NvdXJjZTogXCJ3aW5kb3dcIiwgdGFyZ2V0OiBcImJ1dHRvblwiLCBkYXNoZWQ6IHRydWV9XSxcbiAgICBbXCJhZGROb2RlXCIsIHt0eXBlOiBcImNhbGxTdGFja1wiLCBpZDogXCJjYWxsU3RhY2tcIn1dLFxuICBdLFxuICBbXG4gICAgW1wiaGlnaGxpZ2h0XCIsIFsxLCA4XV0sXG4gIF0sXG4gIFtcbiAgICBbXCJhZGROb2RlXCIsIHtkaXNwbGF5OiBcInsgfVwiLCB0eXBlOiBcIm9iamVjdFwiLCBpZDogXCJjbGlja0NvdW50ZXIxXCJ9XSxcbiAgICBbXCJoaWdobGlnaHRcIiwgW1wiMTA6MjFcIiwgXCIxMDozOVwiXV0sXG4gIF0sXG4gIFtcbiAgICAvLyBbXCJhZGRMaW5rXCIsIHtzb3VyY2U6IFwid2luZG93XCIsIHRhcmdldDogXCJjYWxsU3RhY2tcIiwgZGFzaGVkOiB0cnVlfV0sXG4gICAgW1wiYWRkTm9kZVwiLCB7ZGlzcGxheTogXCJzY29wZVwiLCB0eXBlOiBcImZ1bmN0aW9uXCIsIGlkOiBcInNjb3BlMVwifV0sXG4gICAgW1wiYWRkTGlua1wiLCB7ZGlzcGxheTogXCJDbGlja0NvdW50ZXJcIiwgc291cmNlOiBcImNhbGxTdGFja1wiLCB0YXJnZXQ6IFwic2NvcGUxXCJ9XSxcbiAgICBbXCJhZGRMaW5rXCIsIHtkaXNwbGF5OiBcInRoaXNcIiwgc291cmNlOiBcInNjb3BlMVwiLCB0YXJnZXQ6IFwiY2xpY2tDb3VudGVyMVwifV0sXG4gICAgW1wiaGlnaGxpZ2h0XCIsIFsyLCA3XV0sXG4gIF0sXG5cbiAgW1xuICAgIFtcImFkZE5vZGVcIiwge2Rpc3BsYXk6IFwiMFwiLCB0eXBlOiBcInZhbHVlXCIsIGlkOiBcImNvdW50Q2xpY2tzMVwifV0sXG4gICAgW1wiYWRkTGlua1wiLCB7ZGlzcGxheTogXCJjb3VudENsaWNrc1wiLCBzb3VyY2U6IFwiY2xpY2tDb3VudGVyMVwiLCB0YXJnZXQ6IFwiY291bnRDbGlja3MxXCJ9XSxcbiAgICBbXCJoaWdobGlnaHRcIiwgW1wiMjozXCIsIFwiMjoyNFwiXV0sXG4gIF0sXG4gIFtcbiAgICBbXCJyZW5hbWVMaW5rXCIsIHtkaXNwbGF5OiBcInRoaXMgLyBzY29wZVwiLCBzb3VyY2U6IFwic2NvcGUxXCIsIHRhcmdldDogXCJjbGlja0NvdW50ZXIxXCJ9XSxcbiAgICBbXCJoaWdobGlnaHRcIiwgW1wiNDozXCIsIFwiNDoyMFwiXV0sXG4gIF0sXG4gIFtcbiAgICBbXCJhZGROb2RlXCIsIHtkaXNwbGF5OiBcImZuXCIsIHR5cGU6IFwiZnVuY3Rpb25cIiwgaWQ6IFwiYnV0dG9uQ2xpY2sxXCJ9XSxcbiAgICBbXCJhZGRMaW5rXCIsIHtzb3VyY2U6IFwic2NvcGUxXCIsIHRhcmdldDogXCJidXR0b25DbGljazFcIn1dLFxuICAgIFtcImhpZ2hsaWdodFwiLCBbXCI1OjIxXCIsIFwiNzo0XCJdXSxcbiAgXSxcbiAgW1xuICAgIFtcImFkZExpbmtcIiwge3NvdXJjZTogXCJidXR0b25DbGljazFcIiwgdGFyZ2V0OiBcImNsaWNrQ291bnRlcjFcIn1dLFxuICAgIFtcImhpZ2hsaWdodFwiLCBbXCI2OjVcIiwgXCI2OjEwXCJdXSxcbiAgXSxcbiAgW1xuICAgIFtcImFkZExpbmtcIiwge2Rpc3BsYXk6IFwib25DbGlja1wiLCBzb3VyY2U6IFwiYnV0dG9uXCIsIHRhcmdldDogXCJidXR0b25DbGljazFcIn1dLFxuICAgIFtcImhpZ2hsaWdodFwiLCBbNSwgN11dLFxuICBdLFxuICBbXG4gICAgW1wicmVtb3ZlTm9kZVwiLCBcImNvdW50Q2xpY2tzMVwiXVxuICBdLFxuICBbXG4gICAgW1wicmVtb3ZlTm9kZVwiLCBcInNjb3BlMVwiXSxcbiAgXSxcbiAgW1xuICAgIFtcImFkZExpbmtcIiwge2Rpc3BsYXk6IFwiY2xpY2tDb3VudGVyMVwiLCBzb3VyY2U6IFwid2luZG93XCIsIHRhcmdldDogXCJjbGlja0NvdW50ZXIxXCIsIGRpc3RhbmNlOiAyfV0sXG4gICAgW1wiaGlnaGxpZ2h0XCIsIFtcIjEwOjFcIiwgXCIxMDoxOFwiXV0sXG4gIF0sXG4gIFtcbiAgICBbXCJhZGROb2RlXCIsIHtkaXNwbGF5OiBcInt9XCIsIHR5cGU6IFwib2JqZWN0XCIsIGlkOiBcImNsaWNrQ291bnRlcjJcIn1dLFxuICAgIFtcImFkZE5vZGVcIiwge2Rpc3BsYXk6IFwiZm5cIiwgdHlwZTogXCJmdW5jdGlvblwiLCBpZDogXCJidXR0b25DbGljazJcIn1dLFxuICAgIFtcImFkZExpbmtcIiwge2Rpc3BsYXk6IFwiY2xpY2tDb3VudGVyMlwiLCBzb3VyY2U6IFwid2luZG93XCIsIHRhcmdldDogXCJjbGlja0NvdW50ZXIyXCIsIGRpc3RhbmNlOiAyfV0sXG4gICAgW1wiYWRkTGlua1wiLCB7c291cmNlOiBcImJ1dHRvbkNsaWNrMlwiLCB0YXJnZXQ6IFwiY2xpY2tDb3VudGVyMlwifV0sXG4gICAgW1wiYWRkTGlua1wiLCB7ZGlzcGxheTogXCJvbkNsaWNrXCIsIHNvdXJjZTogXCJidXR0b25cIiwgdGFyZ2V0OiBcImJ1dHRvbkNsaWNrMlwifV0sXG4gICAgW1wiaGlnaGxpZ2h0XCIsIDExXSxcbiAgXSxcbiAgW1xuICAgIFtcImFkZE5vZGVcIiwge2Rpc3BsYXk6IFwie31cIiwgdHlwZTogXCJvYmplY3RcIiwgaWQ6IFwiY2xpY2tDb3VudGVyM1wifV0sXG4gICAgW1wiYWRkTm9kZVwiLCB7ZGlzcGxheTogXCJmblwiLCB0eXBlOiBcImZ1bmN0aW9uXCIsIGlkOiBcImJ1dHRvbkNsaWNrM1wifV0sXG4gICAgW1wiYWRkTGlua1wiLCB7ZGlzcGxheTogXCJjbGlja0NvdW50ZXIzXCIsIHNvdXJjZTogXCJ3aW5kb3dcIiwgdGFyZ2V0OiBcImNsaWNrQ291bnRlcjNcIn1dLFxuICAgIFtcImFkZExpbmtcIiwge3NvdXJjZTogXCJidXR0b25DbGljazNcIiwgdGFyZ2V0OiBcImNsaWNrQ291bnRlcjNcIn1dLFxuICAgIFtcImFkZExpbmtcIiwge2Rpc3BsYXk6IFwib25DbGlja1wiLCBzb3VyY2U6IFwiYnV0dG9uXCIsIHRhcmdldDogXCJidXR0b25DbGljazNcIn1dLFxuICAgIFtcImhpZ2hsaWdodFwiLCAxMl0sXG4gIF0sXG4gIFtcbiAgICBbXCJyZW1vdmVMaW5rXCIsIFtcIndpbmRvd1wiLCBcImNsaWNrQ291bnRlcjFcIl1dLFxuICAgIFtcImhpZ2hsaWdodFwiLCAxNl0sXG4gIF0sXG4gIFtcbiAgICBbXCJyZW1vdmVMaW5rXCIsIFtcIndpbmRvd1wiLCBcImNsaWNrQ291bnRlcjJcIl1dLFxuICAgIFtcImhpZ2hsaWdodFwiLCAxN10sXG4gIF0sXG4gIFtcbiAgICBbXCJyZW1vdmVMaW5rXCIsIFtcIndpbmRvd1wiLCBcImNsaWNrQ291bnRlcjNcIl1dLFxuICAgIFtcImhpZ2hsaWdodFwiLCAxOF0sXG4gIF1cbl1cbiIsIm1vZHVsZS5leHBvcnRzID0ge1xuICBcImJhc2ljc1wiIDogcmVxdWlyZSgnLi9iYXNpY3MnKSxcbiAgXCJkaXJlY3Rpb25hbFwiIDogcmVxdWlyZSgnLi9kaXJlY3Rpb25hbCcpLFxuICBcImNyZWF0ZS10ZW4tZWxlbWVudHNcIiA6IHJlcXVpcmUoJy4vY3JlYXRlLXRlbi1lbGVtZW50cycpLFxuICBcImNyZWF0ZS10ZW4tZWxlbWVudHMtcmV0dXJuc1wiIDogcmVxdWlyZSgnLi9jcmVhdGUtdGVuLWVsZW1lbnRzLXJldHVybnMnKSxcbiAgXCJhY2NpZGVudGFsLWdsb2JhbHNcIiA6IHJlcXVpcmUoJy4vYWNjaWRlbnRhbC1nbG9iYWxzJyksXG4gIFwiZnVuY3Rpb24tY2FwdHVyZVwiIDogcmVxdWlyZSgnLi9mdW5jdGlvbi1jYXB0dXJlJyksXG4gIFwiYmluZC1ldmVudFwiIDogcmVxdWlyZSgnLi9iaW5kLWV2ZW50JyksXG4gIFwiaGFuZGxlci1sZWFrXCIgOiByZXF1aXJlKCcuL2hhbmRsZXItbGVhaycpLFxuICBcImhhbmRsZXItbGVhay1maXhcIiA6IHJlcXVpcmUoJy4vaGFuZGxlci1sZWFrLWZpeCcpLFxuICBcInJldGFpbmluZy1wYXRoc1wiIDogcmVxdWlyZSgnLi9yZXRhaW5pbmctcGF0aHMnKSxcbiAgXCJvYmplY3QtdnMtbWFwXCIgOiByZXF1aXJlKCcuL29iamVjdC12cy1tYXAnKSxcbiAgXCJtYXAtY2FjaGVcIiA6IHJlcXVpcmUoJy4vbWFwLWNhY2hlJyksXG4gIFwid2Vha21hcC1jYWNoZVwiIDogcmVxdWlyZSgnLi93ZWFrbWFwLWNhY2hlJyksXG59XG4iLCJleHBvcnRzLmNvZGUgPSBgdmFyIGNhY2hlID0gTWFwKCk7XG5cbmZ1bmN0aW9uIGdldEZhbmN5RWRpdG9yKGVsZW1lbnQpIHtcbiAgLy8gQ2hlY2sgaWYgaW4gY2FjaGUgYWxyZWFkeS5cbiAgdmFyIGZhbmN5RWRpdG9yID0gY2FjaGUuZ2V0KGVsZW1lbnQpO1xuICBpZiAoZmFuY3lFZGl0b3IpIHtcbiAgICByZXR1cm4gZmFuY3lFZGl0b3I7XG4gIH1cblxuICAvLyBOb3QgaW4gY2FjaGUsIGNyZWF0ZSBhIG5ldyBvbmUuXG4gIGZhbmN5RWRpdG9yID0gbmV3IEZhbmN5RWRpdG9yKGVsZW1lbnQpO1xuICBjYWNoZS5zZXQoZWxlbWVudCwgZmFuY3lFZGl0b3IpO1xuICByZXR1cm4gZmFuY3lFZGl0b3I7XG59XG5cbnZhciBlbEEgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcjY29tbWVudC1ib3gnKTtcbnZhciBlbEIgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcjYWRtaW4tZWRpdG9yJyk7XG5cbnZhciBjb21tZW50Qm94MSA9IGdldEZhbmN5RWRpdG9yKGVsQSk7XG52YXIgY29tbWVudEJveDIgPSBnZXRGYW5jeUVkaXRvcihlbEEpO1xuXG52YXIgY29tbWVudEJveDMgPSBnZXRGYW5jeUVkaXRvcihlbEIpO1xudmFyIGNvbW1lbnRCb3g0ID0gZ2V0RmFuY3lFZGl0b3IoZWxCKTtcblxuY29tbWVudEJveDEgPSB1bmRlZmluZWQ7XG5jb21tZW50Qm94MiA9IHVuZGVmaW5lZDtcbmNvbW1lbnRCb3gzID0gdW5kZWZpbmVkO1xuY29tbWVudEJveDQgPSB1bmRlZmluZWQ7XG5cbmVsQS5yZW1vdmUoKTtcbmVsQSA9IHVuZGVmaW5lZDtcbmVsQi5yZW1vdmUoKTtcbmVsQiA9IHVuZGVmaW5lZDtcbmBcblxuZXhwb3J0cy5zdGVwcyA9IFtcbiAgW1xuICAgIFtcImFkZE5vZGVcIiwge3R5cGU6IFwid2luZG93XCIsIGlkOiBcIndpbmRvd1wifV0sXG4gICAgW1wiYWRkTm9kZVwiLCB7dHlwZTogXCJjYWxsU3RhY2tcIiwgaWQ6IFwiY2FsbFN0YWNrXCJ9XSxcbiAgLy8gXSxcbiAgLy8gW1xuICAgIC8vIHZhciBjYWNoZSA9IE1hcCgpO1xuICAgIFtcImFkZE5vZGVcIiwge3R5cGU6IFwiTWFwXCIsIGRpc3BsYXk6IFwiTWFwXCIsIGlkOiBcImNhY2hlXCJ9XSxcbiAgICBbXCJhZGRMaW5rXCIsIHtzb3VyY2U6IFwid2luZG93XCIsIHRhcmdldDogXCJjYWNoZVwiLCBkaXNwbGF5OiBcImNhY2hlXCJ9XSxcbiAgICBbXCJoaWdobGlnaHRcIiwgMV0sXG4gIF0sXG4gIFtcbiAgICAvLyBmdW5jdGlvbiBnZXRGYW5jeUVkaXRvcihlbGVtZW50KSB7IC4uLiB9XG4gICAgW1wiaGlnaGxpZ2h0XCIsIFszLDE0XV0sXG4gIF0sXG4gIFtcbiAgICAvLyB2YXIgZWxBID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignI2NvbW1lbnQtYm94Jyk7XG4gICAgW1wiaGlnaGxpZ2h0XCIsIDE2XSxcbiAgICBbXCJhZGROb2RlXCIsIHtpZDogXCJlbEFcIiwgdHlwZTogXCJvYmplY3RcIiwgXCJkaXNwbGF5XCI6IFwiPCA+XCJ9XSxcbiAgICBbXCJhZGRMaW5rXCIsIHtzb3VyY2U6IFwid2luZG93XCIsIHRhcmdldDogXCJlbEFcIiwgZGlzcGxheTogXCJlbEFcIn1dLFxuICBdLFxuICBbXG4gICAgLy8gdmFyIGVsQiA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJyNhZG1pbi1lZGl0b3InKTtcbiAgICBbXCJoaWdobGlnaHRcIiwgMTddLFxuICAgIFtcImFkZE5vZGVcIiwge2lkOiBcImVsQlwiLCB0eXBlOiBcIm9iamVjdFwiLCBcImRpc3BsYXlcIjogXCI8ID5cIn1dLFxuICAgIFtcImFkZExpbmtcIiwge3NvdXJjZTogXCJ3aW5kb3dcIiwgdGFyZ2V0OiBcImVsQlwiLCBkaXNwbGF5OiBcImVsQlwifV0sXG4gIF0sXG5cbiAgLy8tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgLy8gQ29tbWVudCBCb3ggMVxuICBbXG4gICAgLy8gZ2V0RmFuY3lFZGl0b3IoZWxBKVxuICAgIFtcImhpZ2hsaWdodFwiLCBbXCIxOToxOVwiLCBcIjE5OjM4XCJdXSxcbiAgICBbXCJhZGROb2RlXCIsIHt0eXBlOiBcImZ1bmN0aW9uXCIsIGRpc3BsYXk6IFwic2NvcGVcIiwgaWQ6IFwic2NvcGUxXCJ9XSxcbiAgICBbXCJhZGRMaW5rXCIsIHtzb3VyY2U6IFwiY2FsbFN0YWNrXCIsIHRhcmdldDogXCJzY29wZTFcIiwgZGlzcGxheTogXCJnZXRGYW5jeUVkaXRvclwifV0sXG4gIF0sXG4gIFtcbiAgICAvLyBnZXRGYW5jeUVkaXRvcihlbGVtZW50KSBhcmdzXG4gICAgW1wiaGlnaGxpZ2h0XCIsIFtcIjM6MjVcIiwgXCIzOjMyXCJdXSxcbiAgICBbXCJhZGRMaW5rXCIsIHtzb3VyY2U6IFwic2NvcGUxXCIsIHRhcmdldDogXCJlbEFcIiwgZGFzaGVkOiB0cnVlfV0sXG4gIF0sXG4gIFtcbiAgICAvLyB2YXIgZmFuY3lFZGl0b3IgPSBjYWNoZS5nZXQoZWxlbWVudCk7XG4gICAgW1wiaGlnaGxpZ2h0XCIsIDVdLFxuICAgIFtcImFkZE5vZGVcIiwge2lkOiBcInVuZGVmaW5lZDFcIiwgdHlwZTogXCJ2YWx1ZVwiLCBkaXNwbGF5OiBcInVuZGVmaW5lZFwifV0sXG4gICAgW1wiYWRkTGlua1wiLCB7c291cmNlOiBcInNjb3BlMVwiLCB0YXJnZXQ6IFwidW5kZWZpbmVkMVwiLCBkaXNwbGF5OiBcImZhbmN5RWRpdG9yXCIsIGRpc3RhbmNlOiAxLjV9XSxcbiAgXSxcbiAgW1xuICAgIC8vIGlmIChmYW5jeUVkaXRvcikgeyAuLi4gfVxuICAgIFtcImhpZ2hsaWdodFwiLCBbNiw4XV1cbiAgXSxcbiAgW1xuICAgIC8vIGZhbmN5RWRpdG9yID0gbmV3IEZhbmN5RWRpdG9yKGVsZW1lbnQpO1xuICAgIFtcImhpZ2hsaWdodFwiLCAxMV0sXG4gICAgW1wicmVtb3ZlTm9kZVwiLCBcInVuZGVmaW5lZDFcIl0sXG4gICAgW1wiYWRkTm9kZVwiLCB7aWQ6IFwiZmFuY3lFZGl0b3IxXCIsIHR5cGU6IFwib2JqZWN0XCIsIGRpc3BsYXk6IFwiLiAuIC4uIGZhbmN5RWRpdG9yXCIsIHJhZGl1czogM31dLFxuICAgIFtcImFkZExpbmtcIiwge3NvdXJjZTogXCJzY29wZTFcIiwgdGFyZ2V0OiBcImZhbmN5RWRpdG9yMVwiLCBkaXNwbGF5OiBcImZhbmN5RWRpdG9yXCIsIGRpc3RhbmNlOiAyLjV9XSxcbiAgXSxcbiAgW1xuICAgIC8vIGNhY2hlLnNldChlbGVtZW50LCBmYW5jeUVkaXRvcik7XG4gICAgW1wiaGlnaGxpZ2h0XCIsIDEyXSxcbiAgICBbXCJhZGRMaW5rXCIsIHtzb3VyY2U6IFwiY2FjaGVcIiwgdGFyZ2V0OiBcImZhbmN5RWRpdG9yMVwiLCBkaXNwbGF5OiBcIjxlbEE+ICAgICBcIiwgZGlzdGFuY2U6IDIuNX1dLFxuICAgIFtcImFkZExpbmtcIiwge3NvdXJjZTogXCJjYWNoZVwiLCB0YXJnZXQ6IFwiZWxBXCIsIGRpc3BsYXk6IFwia2V5XCJ9XSxcbiAgXSxcbiAgW1xuICAgIC8vIHJldHVybiBmYW5jeUVkaXRvcjtcbiAgICBbXCJoaWdobGlnaHRcIiwgMTNdLFxuICBdLFxuICBbXG4gICAgLy8gdmFyIGNvbW1lbnRCb3gxID0gZ2V0RmFuY3lFZGl0b3IoZWxBKTtcbiAgICBbXCJoaWdobGlnaHRcIiwgMTldLFxuICAgIFtcInJlbW92ZU5vZGVcIiwgXCJzY29wZTFcIl0sXG4gICAgW1wiYWRkTGlua1wiLCB7c291cmNlOiBcIndpbmRvd1wiLCB0YXJnZXQ6IFwiZmFuY3lFZGl0b3IxXCIsIGRpc3BsYXk6IFwiY29tbWVudEJveDFcIiwgZGlzdGFuY2U6IDIuNX1dLFxuICBdLFxuXG4gIC8vLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gIC8vIENvbW1lbnQgQm94IDJcbiAgW1xuICAgIC8vIGdldEZhbmN5RWRpdG9yKGVsQSlcbiAgICBbXCJoaWdobGlnaHRcIiwgW1wiMjA6MTlcIiwgXCIyMDozOFwiXV0sXG4gICAgW1wiYWRkTm9kZVwiLCB7dHlwZTogXCJmdW5jdGlvblwiLCBkaXNwbGF5OiBcInNjb3BlXCIsIGlkOiBcInNjb3BlMlwifV0sXG4gICAgW1wiYWRkTGlua1wiLCB7c291cmNlOiBcImNhbGxTdGFja1wiLCB0YXJnZXQ6IFwic2NvcGUyXCIsIGRpc3BsYXk6IFwiZ2V0RmFuY3lFZGl0b3JcIn1dLFxuICBdLFxuICBbXG4gICAgLy8gZ2V0RmFuY3lFZGl0b3IoZWxlbWVudCkgYXJnc1xuICAgIFtcImhpZ2hsaWdodFwiLCBbXCIzOjI1XCIsIFwiMzozMlwiXV0sXG4gICAgW1wiYWRkTGlua1wiLCB7c291cmNlOiBcInNjb3BlMlwiLCB0YXJnZXQ6IFwiZWxBXCIsIGRhc2hlZDogdHJ1ZX1dLFxuICBdLFxuICBbXG4gICAgLy8gdmFyIGZhbmN5RWRpdG9yID0gY2FjaGUuZ2V0KGVsZW1lbnQpO1xuICAgIFtcImhpZ2hsaWdodFwiLCA1XSxcbiAgICBbXCJhZGRMaW5rXCIsIHtzb3VyY2U6IFwic2NvcGUyXCIsIHRhcmdldDogXCJmYW5jeUVkaXRvcjFcIiwgZGlzcGxheTogXCJmYW5jeUVkaXRvclwiLCBkaXN0YW5jZTogMi41fV0sXG4gIF0sXG4gIFtcbiAgICAvLyBpZiAoZmFuY3lFZGl0b3IpIHsgLi4uIH1cbiAgICBbXCJoaWdobGlnaHRcIiwgWzYsOF1dXG4gIF0sXG4gIFtcbiAgICAvLyByZXR1cm4gZmFuY3lFZGl0b3I7XG4gICAgW1wiaGlnaGxpZ2h0XCIsIDddXG4gIF0sXG4gIFtcbiAgICAvLyB2YXIgY29tbWVudEJveDIgPSBnZXRGYW5jeUVkaXRvcihlbEEpO1xuICAgIFtcImhpZ2hsaWdodFwiLCAyMF0sXG4gICAgW1wicmVtb3ZlTm9kZVwiLCBcInNjb3BlMlwiXSxcbiAgICBbXCJyZW5hbWVMaW5rXCIsIHtzb3VyY2U6IFwid2luZG93XCIsIHRhcmdldDogXCJmYW5jeUVkaXRvcjFcIiwgZGlzcGxheTogXCJjb21tZW50Qm94MS8yXCIsIGRpc3RhbmNlOiAyLjV9XSxcbiAgXSxcblxuICAvLy0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gIC8vIFJlbWFpbmluZyBjb21tZW50IGJveGVzXG4gIFtcbiAgICAvLyB2YXIgY29tbWVudEJveDMgPSBnZXRGYW5jeUVkaXRvcihlbEIpO1xuICAgIC8vIHZhciBjb21tZW50Qm94NCA9IGdldEZhbmN5RWRpdG9yKGVsQik7XG4gICAgW1wiYWRkTm9kZVwiLCB7aWQ6IFwiZmFuY3lFZGl0b3IyXCIsIHR5cGU6IFwib2JqZWN0XCIsIGRpc3BsYXk6IFwiLiAuIC4uIGZhbmN5RWRpdG9yXCIsIHJhZGl1czogM31dLFxuICAgIFtcImFkZExpbmtcIiwge3NvdXJjZTogXCJjYWNoZVwiLCB0YXJnZXQ6IFwiZmFuY3lFZGl0b3IyXCIsIGRpc3BsYXk6IFwiPGVsQj4gICAgIFwiLCBkaXN0YW5jZTogMi41fV0sXG4gICAgW1wiYWRkTGlua1wiLCB7c291cmNlOiBcImNhY2hlXCIsIHRhcmdldDogXCJlbEJcIiwgZGlzcGxheTogXCJrZXlcIn1dLFxuICAgIFtcImFkZExpbmtcIiwge3NvdXJjZTogXCJ3aW5kb3dcIiwgdGFyZ2V0OiBcImZhbmN5RWRpdG9yMlwiLCBkaXNwbGF5OiBcImNvbW1lbnRCb3gzLzRcIiwgZGlzdGFuY2U6IDIuNX1dLFxuICAgIFtcImhpZ2hsaWdodFwiLCBbMjIsIDIzXV0sXG4gIF0sXG5cbiAgW1xuICAgIC8vY29tbWVudEJveDEvMiA9IHVuZGVmaW5lZDtcbiAgICBbXCJyZW1vdmVMaW5rXCIsIFtcIndpbmRvd1wiLCBcImZhbmN5RWRpdG9yMVwiXV0sXG4gICAgW1wiaGlnaGxpZ2h0XCIsIFsyNSwgMjZdXSxcbiAgXSxcbiAgW1xuICAgIC8vIGNvbW1lbnRCb3gzLzQgPSB1bmRlZmluZWQ7XG4gICAgW1wicmVtb3ZlTGlua1wiLCBbXCJ3aW5kb3dcIiwgXCJmYW5jeUVkaXRvcjJcIl1dLFxuICAgIFtcImhpZ2hsaWdodFwiLCBbMjcsIDI4XV0sXG4gIF0sXG4gIFtcbiAgICBbXCJyZW1vdmVMaW5rXCIsIFtcIndpbmRvd1wiLCBcImVsQVwiXV0sXG4gICAgW1wicmVtb3ZlTGlua1wiLCBbXCJ3aW5kb3dcIiwgXCJlbEJcIl1dLFxuICAgIFtcImhpZ2hsaWdodFwiLCBbMzAsIDMzXV0sXG4gIF0sXG5dXG4iLCJleHBvcnRzLmNvZGUgPSBgLy8gQXNzb2NpYXRlIHRoZSB0ZXh0IGNvbnRlbnQgb2YgYSBkaXYgd2l0aCBhIGtleS5cblxudmFyIGlkID0gXCJteUVsZW1lbnRcIjtcbnZhciBkaXYgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChpZCk7XG5cbnZhciBvYmplY3QgPSB7fTtcbm9iamVjdFtpZF0gPSBkaXYudGV4dENvbnRlbnQ7XG5cbmNvbnNvbGUubG9nKG9iamVjdC5teUVsZW1lbnQpO1xuY29uc29sZS5sb2cob2JqZWN0W2lkXSk7XG5cbnZhciBtYXAgPSBuZXcgTWFwKCk7XG5tYXAuc2V0KGlkLCBkaXYudGV4dENvbnRlbnQpO1xubWFwLnNldChkaXYsIGRpdi50ZXh0Q29udGVudCk7XG5cbmNvbnNvbGUubG9nKG1hcC5nZXQoZGl2KSk7XG5jb25zb2xlLmxvZyhtYXAuZ2V0KGlkKSk7XG5gXG5cbmV4cG9ydHMuc3RlcHMgPSBbXG4gIFtdLFxuICBbXG4gICAgW1wiaGlnaGxpZ2h0XCIsIFszLDRdXSxcbiAgXSxcbiAgW1xuICAgIFtcImhpZ2hsaWdodFwiLCBbNiw3XV0sXG4gIF0sXG4gIFtcbiAgICBbXCJoaWdobGlnaHRcIiwgWzksMTBdXSxcbiAgXSxcbiAgW1xuICAgIFtcImhpZ2hsaWdodFwiLCBbMTIsMTRdXSxcbiAgXSxcbiAgW1xuICAgIFtcImhpZ2hsaWdodFwiLCBbMTYsMTddXSxcbiAgXVxuXVxuIiwiZXhwb3J0cy5jb2RlID0gYHZhciBhID0ge307XG5hLmIgPSB7fTtcbmEuYi5jID0ge307XG5hLmIuYy5kID0ge307XG5hLmIuYy5kLmxhcmdlVGhpbmcgPSBuZXcgQXJyYXlCdWZmZXIoMTAwMDAwKTtcblxuLy8gTGl2ZSBkZW1vOiAuL3JldGFpbmluZy5odG1sXG5gXG5cbmV4cG9ydHMuc3RlcHMgPSBbXG4gIFtcbiAgICBbXCJhZGROb2RlXCIsIHt0eXBlOiBcIndpbmRvd1wiLCBpZDogXCJ3aW5kb3dcIn1dLFxuICBdLFxuICBbXG4gICAgW1wiYWRkTm9kZVwiLCB7dHlwZTogXCJ2YWx1ZVwiLCBpZDogXCJhXCIsIGRpc3BsYXk6IFwie31cIn1dLFxuICAgIFtcImFkZExpbmtcIiwge3NvdXJjZTogXCJ3aW5kb3dcIiwgdGFyZ2V0OiBcImFcIiwgZGlzcGxheTogXCJhXCJ9XSxcbiAgICBbXCJoaWdobGlnaHRcIiwgMV0sXG4gIF0sXG4gIFtcbiAgICBbXCJhZGROb2RlXCIsIHt0eXBlOiBcInZhbHVlXCIsIGlkOiBcImJcIiwgZGlzcGxheTogXCJ7fVwifV0sXG4gICAgW1wiYWRkTGlua1wiLCB7c291cmNlOiBcImFcIiwgdGFyZ2V0OiBcImJcIiwgZGlzcGxheTogXCJiXCJ9XSxcbiAgICBbXCJoaWdobGlnaHRcIiwgMl0sXG4gIF0sXG4gIFtcbiAgICBbXCJhZGROb2RlXCIsIHt0eXBlOiBcInZhbHVlXCIsIGlkOiBcImNcIiwgZGlzcGxheTogXCJ7fVwifV0sXG4gICAgW1wiYWRkTGlua1wiLCB7c291cmNlOiBcImJcIiwgdGFyZ2V0OiBcImNcIiwgZGlzcGxheTogXCJjXCJ9XSxcbiAgICBbXCJoaWdobGlnaHRcIiwgM10sXG4gIF0sXG4gIFtcbiAgICBbXCJhZGROb2RlXCIsIHt0eXBlOiBcInZhbHVlXCIsIGlkOiBcImRcIiwgZGlzcGxheTogXCJ7fVwifV0sXG4gICAgW1wiYWRkTGlua1wiLCB7c291cmNlOiBcImNcIiwgdGFyZ2V0OiBcImRcIiwgZGlzcGxheTogXCJkXCJ9XSxcbiAgICBbXCJoaWdobGlnaHRcIiwgNF0sXG4gIF0sXG4gIFtcbiAgICBbXCJhZGROb2RlXCIsIHt0eXBlOiBcIm9iamVjdFwiLCBpZDogXCJsYXJnZVRoaW5nXCIsIGRpc3BsYXk6IFwiLi4uLi4uLi4uLi4uLiBBcnJheUJ1ZmZlclwiLCByYWRpdXM6IDV9XSxcbiAgICBbXCJhZGRMaW5rXCIsIHtzb3VyY2U6IFwiZFwiLCB0YXJnZXQ6IFwibGFyZ2VUaGluZ1wiLCBkaXN0YW5jZTogMiwgZGlzcGxheTogXCJsYXJnZVRoaW5nIFxcdTAwYTBcXHUwMGEwXFx1MDBhMFxcdTAwYTBcXHUwMGEwXFx1MDBhMFxcdTAwYTBcXHUwMGEwXFx1MDBhMFxcdTAwYTBcXHUwMGEwXFx1MDBhMFxcdTAwYTBcXHUwMGEwXFx1MDBhMFxcdTAwYTBcXHUwMGEwXFx1MDBhMFxcdTAwYTBcXHUwMGEwXFx1MDBhMFxcdTAwYTBcIn1dLFxuICAgIFtcImhpZ2hsaWdodFwiLCA1XSxcbiAgXSxcbl1cbiIsImV4cG9ydHMuY29kZSA9IGB2YXIgY2FjaGUgPSBXZWFrTWFwKCk7XG5cbmZ1bmN0aW9uIGdldEZhbmN5RWRpdG9yKGVsZW1lbnQpIHtcbiAgLy8gQ2hlY2sgaWYgaW4gY2FjaGUgYWxyZWFkeS5cbiAgdmFyIGZhbmN5RWRpdG9yID0gY2FjaGUuZ2V0KGVsZW1lbnQpO1xuICBpZiAoZmFuY3lFZGl0b3IpIHtcbiAgICByZXR1cm4gZmFuY3lFZGl0b3I7XG4gIH1cblxuICAvLyBOb3QgaW4gY2FjaGUsIGNyZWF0ZSBhIG5ldyBvbmUuXG4gIGZhbmN5RWRpdG9yID0gbmV3IEZhbmN5RWRpdG9yKGVsZW1lbnQpO1xuICBjYWNoZS5zZXQoZWxlbWVudCwgZmFuY3lFZGl0b3IpO1xuICByZXR1cm4gZmFuY3lFZGl0b3I7XG59XG5cbnZhciBlbEEgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcjY29tbWVudC1ib3gnKTtcbnZhciBlbEIgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcjYWRtaW4tZWRpdG9yJyk7XG5cbnZhciBjb21tZW50Qm94MSA9IGdldEZhbmN5RWRpdG9yKGVsQSk7XG52YXIgY29tbWVudEJveDIgPSBnZXRGYW5jeUVkaXRvcihlbEEpO1xuXG52YXIgY29tbWVudEJveDMgPSBnZXRGYW5jeUVkaXRvcihlbEIpO1xudmFyIGNvbW1lbnRCb3g0ID0gZ2V0RmFuY3lFZGl0b3IoZWxCKTtcblxuY29tbWVudEJveDEgPSB1bmRlZmluZWQ7XG5jb21tZW50Qm94MiA9IHVuZGVmaW5lZDtcbmNvbW1lbnRCb3gzID0gdW5kZWZpbmVkO1xuY29tbWVudEJveDQgPSB1bmRlZmluZWQ7XG5cbmVsQS5yZW1vdmUoKTtcbmVsQSA9IHVuZGVmaW5lZDtcbmVsQi5yZW1vdmUoKTtcbmVsQiA9IHVuZGVmaW5lZDtcbmBcblxuZXhwb3J0cy5zdGVwcyA9IFtcbiAgW1xuICAgIFtcImFkZE5vZGVcIiwge3R5cGU6IFwid2luZG93XCIsIGlkOiBcIndpbmRvd1wifV0sXG4gICAgW1wiYWRkTm9kZVwiLCB7dHlwZTogXCJjYWxsU3RhY2tcIiwgaWQ6IFwiY2FsbFN0YWNrXCJ9XSxcbiAgLy8gXSxcbiAgLy8gW1xuICAgIC8vIHZhciBjYWNoZSA9IFdlYWtNYXAoKTtcbiAgICBbXCJhZGROb2RlXCIsIHt0eXBlOiBcIk1hcFwiLCBkaXNwbGF5OiBcIldlYWtNYXBcIiwgaWQ6IFwiY2FjaGVcIn1dLFxuICAgIFtcImFkZExpbmtcIiwge3NvdXJjZTogXCJ3aW5kb3dcIiwgdGFyZ2V0OiBcImNhY2hlXCIsIGRpc3BsYXk6IFwiY2FjaGVcIn1dLFxuICAgIFtcImhpZ2hsaWdodFwiLCAxXSxcbiAgXSxcbiAgW1xuICAgIC8vIEZ1bmN0aW9uIGRlY2xhcmF0aW9uIGFuZCBlbHNcbiAgICBbXCJoaWdobGlnaHRcIiwgWzMsMTddXSxcbiAgICBbXCJhZGROb2RlXCIsIHtpZDogXCJlbEFcIiwgdHlwZTogXCJvYmplY3RcIiwgXCJkaXNwbGF5XCI6IFwiPCA+XCJ9XSxcbiAgICBbXCJhZGROb2RlXCIsIHtpZDogXCJlbEJcIiwgdHlwZTogXCJvYmplY3RcIiwgXCJkaXNwbGF5XCI6IFwiPCA+XCJ9XSxcbiAgICBbXCJhZGRMaW5rXCIsIHtzb3VyY2U6IFwid2luZG93XCIsIHRhcmdldDogXCJlbEFcIiwgZGlzcGxheTogXCJlbEFcIn1dLFxuICAgIFtcImFkZExpbmtcIiwge3NvdXJjZTogXCJ3aW5kb3dcIiwgdGFyZ2V0OiBcImVsQlwiLCBkaXNwbGF5OiBcImVsQlwifV0sXG4gIF0sXG5cbiAgLy8tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgLy8gQ29tbWVudCBCb3ggMVxuICBbXG4gICAgLy8gdmFyIGNvbW1lbnRCb3gxID0gZ2V0RmFuY3lFZGl0b3IoZWxBKTtcbiAgICAvLyB2YXIgY29tbWVudEJveDIgPSBnZXRGYW5jeUVkaXRvcihlbEEpO1xuICAgIFtcImFkZE5vZGVcIiwge2lkOiBcImZhbmN5RWRpdG9yMVwiLCB0eXBlOiBcIm9iamVjdFwiLCBkaXNwbGF5OiBcIi4gLiAuLiBmYW5jeUVkaXRvclwiLCByYWRpdXM6IDN9XSxcbiAgICBbXCJhZGRMaW5rXCIsIHtzb3VyY2U6IFwiY2FjaGVcIiwgdGFyZ2V0OiBcImZhbmN5RWRpdG9yMVwiLCBkaXNwbGF5OiBcIjxlbEE+ICAgICBcIiwgZGlzdGFuY2U6IDIuNSwgZGFzaGVkOiB0cnVlfV0sXG4gICAgW1wiYWRkTGlua1wiLCB7c291cmNlOiBcImNhY2hlXCIsIHRhcmdldDogXCJlbEFcIiwgZGlzcGxheTogXCJrZXlcIiwgZGFzaGVkOiB0cnVlfV0sXG4gICAgW1wiYWRkTGlua1wiLCB7c291cmNlOiBcIndpbmRvd1wiLCB0YXJnZXQ6IFwiZmFuY3lFZGl0b3IxXCIsIGRpc3BsYXk6IFwiY29tbWVudEJveDEvMlwiLCBkaXN0YW5jZTogMi41fV0sXG4gICAgW1wiaGlnaGxpZ2h0XCIsIFsxOSwgMjBdXSxcbiAgXSxcblxuICAvLy0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gIC8vIENvbW1lbnQgQm94IDJcbiAgW1xuICAgIC8vIHZhciBjb21tZW50Qm94MyA9IGdldEZhbmN5RWRpdG9yKGVsQik7XG4gICAgLy8gdmFyIGNvbW1lbnRCb3g0ID0gZ2V0RmFuY3lFZGl0b3IoZWxCKTtcbiAgICBbXCJhZGROb2RlXCIsIHtpZDogXCJmYW5jeUVkaXRvcjJcIiwgdHlwZTogXCJvYmplY3RcIiwgZGlzcGxheTogXCIuIC4gLi4gZmFuY3lFZGl0b3JcIiwgcmFkaXVzOiAzfV0sXG4gICAgW1wiYWRkTGlua1wiLCB7c291cmNlOiBcImNhY2hlXCIsIHRhcmdldDogXCJmYW5jeUVkaXRvcjJcIiwgZGlzcGxheTogXCI8ZWxCPiAgICAgXCIsIGRpc3RhbmNlOiAyLjUsIGRhc2hlZDogdHJ1ZX1dLFxuICAgIFtcImFkZExpbmtcIiwge3NvdXJjZTogXCJjYWNoZVwiLCB0YXJnZXQ6IFwiZWxCXCIsIGRpc3BsYXk6IFwia2V5XCIsIGRhc2hlZDogdHJ1ZX1dLFxuICAgIFtcImFkZExpbmtcIiwge3NvdXJjZTogXCJ3aW5kb3dcIiwgdGFyZ2V0OiBcImZhbmN5RWRpdG9yMlwiLCBkaXNwbGF5OiBcImNvbW1lbnRCb3gzLzRcIiwgZGlzdGFuY2U6IDIuNX1dLFxuICAgIFtcImhpZ2hsaWdodFwiLCBbMjIsIDIzXV0sXG4gIF0sXG4gIFtcbiAgICBbXCJyZW1vdmVMaW5rXCIsIFtcIndpbmRvd1wiLCBcImZhbmN5RWRpdG9yMVwiXV0sXG4gICAgW1wiaGlnaGxpZ2h0XCIsIFsyNSwgMjZdXSxcbiAgXSxcbiAgW1xuICAgIFtcInJlbW92ZUxpbmtcIiwgW1wid2luZG93XCIsIFwiZmFuY3lFZGl0b3IyXCJdXSxcbiAgICBbXCJoaWdobGlnaHRcIiwgWzI3LCAyOF1dLFxuICBdLFxuICBbXG4gICAgW1wicmVtb3ZlTGlua1wiLCBbXCJ3aW5kb3dcIiwgXCJlbEFcIl1dLFxuICAgIFtcInJlbW92ZUxpbmtcIiwgW1wid2luZG93XCIsIFwiZWxCXCJdXSxcbiAgICBbXCJoaWdobGlnaHRcIiwgWzMwLCAzM11dLFxuICBdLFxuICBbXG4gICAgW1wicmVtb3ZlTm9kZVwiLCBcImZhbmN5RWRpdG9yMVwiXSxcbiAgXSxcbiAgW1xuICAgIFtcInJlbW92ZU5vZGVcIiwgXCJlbEFcIl0sXG4gIF0sXG4gIFtcbiAgICBbXCJyZW1vdmVOb2RlXCIsIFwiZmFuY3lFZGl0b3IyXCJdLFxuICBdLFxuICBbXG4gICAgW1wicmVtb3ZlTm9kZVwiLCBcImVsQlwiXSxcbiAgXSxcbl1cbiIsImV4cG9ydHMuR1JPVVAgPSBPYmplY3QuZnJlZXplKHtcbiAgd2luZG93OiAwLFxuICBhcnJheTogMSxcbiAgb2JqZWN0OiAyLFxuICBmdW5jdGlvbjogMyxcbiAgdmFsdWU6IDQsXG4gIGNhbGxTdGFjazogNSxcbiAgTWFwOiA2LFxufSlcblxuZXhwb3J0cy5TSVpFID0gT2JqZWN0LmZyZWV6ZSh7XG4gIHdpbmRvdzogNCxcbiAgY2FsbFN0YWNrOiAzLFxuICBmdW5jdGlvbjogMyxcbiAgYXJyYXk6IDIsXG4gIG9iamVjdDogMixcbiAgTWFwOiAyLFxuICB2YWx1ZTogMVxufSlcblxuZXhwb3J0cy5MRU5HVEggPSBPYmplY3QuZnJlZXplKHtcbiAgd2luZG93OiAxMCxcbiAgY2FsbFN0YWNrOiAxMCxcbiAgZnVuY3Rpb246IDEwLFxuICBhcnJheTogMixcbiAgb2JqZWN0OiAyLFxuICBNYXA6IDIsXG4gIHZhbHVlOiAwLjNcbn0pXG4iLCJtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHR5cGUgKGdyYXBoLCBjb2RlKSB7XG4gIGNvbnN0IGNvbnRhaW5lciA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5lZGl0b3InKVxuICBncmFwaC5lZGl0b3IgPSBDb2RlTWlycm9yKGNvbnRhaW5lciwge1xuICAgIHZhbHVlOiBjb2RlIHx8IFwiLy8gTm8gY29kZSBwcm92aWRlZFwiLFxuICAgIG1vZGU6IFwiamF2YXNjcmlwdFwiLFxuICAgIGxpbmVOdW1iZXJzOiB0cnVlXG4gIH0pXG5cbiAgZ3JhcGguZGVzdHJveS5wdXNoKCgpID0+IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5Db2RlTWlycm9yJykucmVtb3ZlKCkpXG59XG4iLCJjb25zdCB7IEdST1VQLCBTSVpFLCBMRU5HVEggfSA9IHJlcXVpcmUoJy4vY29uc3RhbnRzJylcbmNvbnN0IGFjdGlvblN0ZXBwZXIgPSByZXF1aXJlKCcuL2FjdGlvbi1zdGVwcGVyJylcbmNvbnN0IHN0YXJ0RWRpdG9yID0gcmVxdWlyZSgnLi9lZGl0b3InKVxuXG4vLyBjb25zdCB7IG5vZGVzLCBsaW5rcyB9ID0gcmVxdWlyZSgnLi9hY3Rpb25zL2RlbW8nKVxuLy8gY29uc3QgZGVtbyA9IHJlcXVpcmUoJy4vYWN0aW9ucy9iYXNpY3MnKVxuLy8gY29uc3QgZGVtbyA9IHJlcXVpcmUoJy4vYWN0aW9ucy9jcmVhdGUtdGVuLWVsZW1lbnRzJylcbi8vIGNvbnN0IGRlbW8gPSByZXF1aXJlKCcuL2FjdGlvbnMvaGFuZGxlci1sZWFrJylcbi8vIGNvbnN0IGRlbW8gPSByZXF1aXJlKCcuL2FjdGlvbnMvaGFuZGxlci1sZWFrLWZpeCcpXG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gc3RhcnQoZGVtbykge1xuICBjb25zdCBncmFwaCA9IG5ldyBNZW1vcnlHcmFwaChkZW1vKVxuXG4gIHN0YXJ0RWRpdG9yKGdyYXBoLCBkZW1vLmNvZGUpXG4gIHNldHVwRm9yY2VUaWNrKGdyYXBoKSxcbiAgYWRkS2V5Ym9hcmRMaXN0ZW5lcihncmFwaCksXG4gIGFkZFJlc2l6ZUxpc3RlbmVyKGdyYXBoLCBncmFwaC5mb3JjZSwgZ3JhcGguZWwpXG5cbiAgcmV0dXJuIGZ1bmN0aW9uIGRlc3Ryb3lWaXN1YWxpemF0aW9uKCkge1xuICAgIGdyYXBoLmRlc3Ryb3kuZm9yRWFjaChmbiA9PiBmbigpKVxuICB9XG59XG5cbmZ1bmN0aW9uIE1lbW9yeUdyYXBoKHtzdGVwcywgbGluZUxlbmd0aH0pIHtcbiAgY29uc3QgZWwgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcubm9kZScpXG4gIHRoaXMuZWwgPSBlbFxuICB0aGlzLnN2ZyA9IGQzLnNlbGVjdChcIi5ub2RlXCIpXG4gICAgLmFwcGVuZChcInN2Z1wiKVxuICAgIC5hdHRyKFwid2lkdGhcIiwgZWwub2Zmc2V0V2lkdGgpXG4gICAgLmF0dHIoXCJoZWlnaHRcIiwgZWwub2Zmc2V0SGVpZ2h0KVxuXG4gIHRoaXMuc3ZnXG4gICAgLmFwcGVuZChcImRlZnNcIilcbiAgICAgIC5hcHBlbmQoXCJtYXJrZXJcIilcbiAgICAgICAgLmF0dHIoXCJpZFwiLCBcImFycm93XCIpXG4gICAgICAgIC5hdHRyKFwibWFya2VyV2lkdGhcIiwgXCIxM1wiKVxuICAgICAgICAuYXR0cihcIm1hcmtlckhlaWdodFwiLCBcIjEzXCIpXG4gICAgICAgIC5hdHRyKFwib3JpZW50XCIsIFwiYXV0b1wiKVxuICAgICAgICAuYXR0cihcInJlZlhcIiwgXCIyXCIpXG4gICAgICAgIC5hdHRyKFwicmVmWVwiLCBcIjZcIilcbiAgICAgICAgLmFwcGVuZChcInBhdGhcIilcbiAgICAgICAgICAuYXR0cihcImRcIiwgXCJNMiwyIEwyLDExIEwxMCw2IEwyLDJcIilcbiAgICAgICAgICAuc3R5bGUoXCJmaWxsXCIsIFwiI2NjY1wiKVxuXG5cbiAgdGhpcy5jb2xvciA9IGQzLnNjYWxlLmNhdGVnb3J5MjAoKVxuXG4gIHRoaXMubGluZUxlbmd0aCA9IGxpbmVMZW5ndGggfHwgNTBcbiAgdGhpcy5mb3JjZSA9IGQzLmxheW91dC5mb3JjZSgpXG4gICAgICAuZ3Jhdml0eSgwLjA1KVxuICAgICAgLmRpc3RhbmNlKGQgPT4gU0laRVtkLnRhcmdldC50eXBlXSAqIDUwKVxuICAgICAgLmNoYXJnZSgtMTAwKVxuICAgICAgLnNpemUoW2VsLm9mZnNldFdpZHRoLCBlbC5vZmZzZXRIZWlnaHRdKVxuXG4gIHRoaXMuJGxpbmsgPSB0aGlzLnN2Zy5hcHBlbmQoXCJnXCIpLnNlbGVjdEFsbChcIi5saW5rXCIpXG4gIHRoaXMuJG5vZGUgPSB0aGlzLnN2Zy5hcHBlbmQoXCJnXCIpLnNlbGVjdEFsbChcIi5ub2RlXCIpXG4gIHRoaXMubm9kZXMgPSBbXVxuICB0aGlzLmxpbmtzID0gW11cbiAgdGhpcy5zdGVwc0pzb24gPSBzdGVwc1xuICB0aGlzLmRlc3Ryb3kgPSBbKCkgPT4ge1xuICAgIHRoaXMuc3ZnLnJlbW92ZSgpXG4gICAgdGhpcy5mb3JjZS5zdG9wKClcbiAgfV1cbn1cblxuZnVuY3Rpb24gcnVuU3RlcChncmFwaCwgaSkge1xuICBncmFwaC5lZGl0b3IuZ2V0QWxsTWFya3MoKS5mb3JFYWNoKG1hcmsgPT4gbWFyay5jbGVhcigpKVxuICBncmFwaC5zdGVwc0pzb25baV0uZm9yRWFjaCgoW2FjdGlvbiwgdmFsdWVdKSA9PiB7XG4gICAgYWN0aW9uU3RlcHBlclthY3Rpb25dKGdyYXBoLCB2YWx1ZSlcbiAgfSlcbn1cblxuZnVuY3Rpb24gcnVuU3RlcHNUbyhncmFwaCwgaSkge1xuICBncmFwaC5ub2RlcyA9IFtdXG4gIGdyYXBoLmxpbmtzID0gW11cbiAgZm9yKGxldCBqPTA7IGogPD0gaTsgaisrKSBydW5TdGVwKGdyYXBoLCBqKVxufVxuXG5mdW5jdGlvbiBhZGRLZXlib2FyZExpc3RlbmVyKGdyYXBoKSB7XG4gIGNvbnN0IEtFWV9SSUdIVCA9IDM5XG4gIGNvbnN0IEtFWV9MRUZUID0gMzdcbiAgbGV0IGN1cnJlbnRTdGVwID0gMFxuICBsZXQge25vZGVzLCBzdGVwc0pzb24sIGZvcmNlfSA9IGdyYXBoXG5cbiAgcnVuU3RlcHNUbyhncmFwaCwgY3VycmVudFN0ZXApXG4gIHVwZGF0ZVZpZXcoZ3JhcGgpXG5cbiAgY29uc3QgaGFuZGxlciA9IGUgPT4ge1xuICAgIGlmKGUua2V5Q29kZSA9PT0gS0VZX1JJR0hUKSB7XG4gICAgICBjb25zdCBuZXh0U3RlcCA9IE1hdGgubWluKGN1cnJlbnRTdGVwICsgMSwgc3RlcHNKc29uLmxlbmd0aCAtIDEpXG4gICAgICBpZiAobmV4dFN0ZXAgIT09IGN1cnJlbnRTdGVwKSB7XG4gICAgICAgIGN1cnJlbnRTdGVwID0gbmV4dFN0ZXBcbiAgICAgICAgcnVuU3RlcChncmFwaCwgY3VycmVudFN0ZXApXG4gICAgICAgIHVwZGF0ZVZpZXcoZ3JhcGgpXG4gICAgICB9XG4gICAgfSBlbHNlIGlmKGUua2V5Q29kZSA9PT0gS0VZX0xFRlQpIHtcbiAgICAgIGNvbnN0IG5leHRTdGVwID0gTWF0aC5tYXgoY3VycmVudFN0ZXAgLSAxLCAwKVxuICAgICAgaWYgKG5leHRTdGVwICE9PSBjdXJyZW50U3RlcCkge1xuICAgICAgICBjdXJyZW50U3RlcCA9IG5leHRTdGVwXG4gICAgICAgIHJ1blN0ZXBzVG8oZ3JhcGgsIGN1cnJlbnRTdGVwKVxuICAgICAgICB1cGRhdGVWaWV3KGdyYXBoKVxuICAgICAgfVxuICAgIH1cbiAgfVxuICAvLyBNb3ZlIHRoZSBncmFwaCBzdGVwIGxlZnQgb3IgcmlnaHQgYnkga2V5Ym9hcmRcbiAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ2tleXVwJywgaGFuZGxlcilcbiAgZ3JhcGguZGVzdHJveS5wdXNoKCgpID0+IHdpbmRvdy5yZW1vdmVFdmVudExpc3RlbmVyKCdrZXl1cCcsIGhhbmRsZXIpKVxufVxuXG5mdW5jdGlvbiBhZGRSZXNpemVMaXN0ZW5lciAoZ3JhcGgsIGZvcmNlLCBlbCkge1xuICBjb25zdCBoYW5kbGVyID0gKCkgPT4ge1xuICAgIGQzLnNlbGVjdChcInN2Z1wiKVxuICAgICAgLmF0dHIoXCJ3aWR0aFwiLCBlbC5vZmZzZXRXaWR0aClcbiAgICAgIC5hdHRyKFwiaGVpZ2h0XCIsIGVsLm9mZnNldEhlaWdodClcblxuICAgIGZvcmNlLnNpemUoW2VsLm9mZnNldFdpZHRoLCBlbC5vZmZzZXRIZWlnaHRdKVxuICB9XG4gIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdyZXNpemUnLCBoYW5kbGVyKVxuICBncmFwaC5kZXN0cm95LnB1c2goKCkgPT4gd2luZG93LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ3Jlc2l6ZScsIGhhbmRsZXIpKVxufVxuXG5mdW5jdGlvbiBnZXROb2RlUmFkaXVzIChub2RlKSB7XG4gIHJldHVybiA1ICogU0laRVtub2RlLnR5cGVdICogKG5vZGUucmFkaXVzIHx8IDEpXG59XG5cbmZ1bmN0aW9uIHVwZGF0ZVZpZXcoZ3JhcGgpIHtcbiAgY29uc3QgeyBmb3JjZSwgY29sb3IsIG5vZGVzLCBsaW5rcywgZWwsIGxpbmVMZW5ndGggfSA9IGdyYXBoXG5cbiAgLy8gVXBkYXRlIHRoZSBncmFwaCdzIHNlbGVjdGlvbnMgd2l0aCB0aGUgY2hhbmdlZCBkYXRhXG4gIGNvbnN0ICRub2RlID0gZ3JhcGguJG5vZGUuZGF0YShub2RlcylcbiAgY29uc3QgJGxpbmsgPSBncmFwaC4kbGluay5kYXRhKGxpbmtzKVxuICBncmFwaC4kbm9kZSA9ICRub2RlXG4gIGdyYXBoLiRsaW5rID0gJGxpbmtcblxuICAvLyBVcGRhdGUgRE9NIG5vZGVzJyBiYXNlIGdyb3VwXG4gICRub2RlLmVudGVyKCkuYXBwZW5kKFwiZ1wiKVxuICAkbGluay5lbnRlcigpLmFwcGVuZChcImdcIilcbiAgJG5vZGUuZXhpdCgpLnJlbW92ZSgpXG4gICRsaW5rLmV4aXQoKS5yZW1vdmUoKVxuICAkbm9kZS5odG1sKFwiXCIpXG4gICRsaW5rLmh0bWwoXCJcIilcblxuICAkbm9kZS5hdHRyKFwiY2xhc3NcIiwgXCJub2RlXCIpXG4gICAgLmNhbGwoZm9yY2UuZHJhZylcblxuICAkbm9kZS5hcHBlbmQoXCJjaXJjbGVcIilcbiAgICAuYXR0cihcImNsYXNzXCIsIFwibm9kZS1jaXJjbGVcIilcbiAgICAuYXR0cihcInJcIiwgZCA9PiBnZXROb2RlUmFkaXVzKGQpKVxuICAgIC5zdHlsZShcImZpbGxcIiwgZCA9PiBjb2xvcihHUk9VUFtkLnR5cGVdKSlcblxuICAkbm9kZS5hcHBlbmQoXCJ0ZXh0XCIpXG4gICAgLmF0dHIoXCJjbGFzc1wiLCBcIm5vZGUtdGV4dFwiKVxuICAgIC5hdHRyKFwiZHhcIiwgZCA9PiA1ICsgNCAqIFNJWkVbZC50eXBlXSlcbiAgICAuYXR0cihcImR5XCIsIFwiLjM1ZW1cIilcbiAgICAuc3R5bGUoXCJmaWxsXCIsIGQgPT4gY29sb3IoR1JPVVBbZC50eXBlXSkpXG4gICAgLy8gUHJpb3JpdHkgb3JkZXIgZm9yIHRleHQgbm9kZXMsIGFsbG93IHRoZW0gdG8gYmUgcmVuYW1lZCwgb3IgdXNlIHRoZVxuICAgIC8vIGRpc3BsYXkgbmFtZS4gSWYgbm9uZSBvZiB0aG9zZSBleGlzdCBqdXN0IHVzZSB0aGUgbm9kZSBuYW1lIHR5cGUuXG4gICAgLnRleHQoZCA9PiBkLnJlbmFtZSB8fCBkLmRpc3BsYXkgfHwgZC50eXBlKVxuXG4gICRsaW5rLmFwcGVuZChcImxpbmVcIilcbiAgICAuYXR0cihcImNsYXNzXCIsIFwibGlua1wiKVxuICAgIC5hdHRyKFwic3Ryb2tlLWRhc2hhcnJheVwiLCAoe2Rhc2hlZH0pID0+IGRhc2hlZCA/IFwiNSwgNVwiIDogZmFsc2UpXG4gICAgLnN0eWxlKFwibWFya2VyLWVuZFwiLCBcInVybCgjYXJyb3cpXCIpXG5cbiAgJGxpbmsuYXBwZW5kKFwidGV4dFwiKVxuICAgIC5hdHRyKFwiY2xhc3NcIiwgXCJlZGdlLXRleHRcIilcbiAgICAuYXR0cihcImR5XCIsIFwiLS4zNWVtXCIpXG4gICAgLnRleHQoZCA9PiBkLnJlbmFtZSB8fCBkLmRpc3BsYXkgfHwgXCJcIilcblxuICAvLyBSZXN0YXJ0IGZvcmNlIGdyYXBoXG4gIGZvcmNlXG4gICAgLm5vZGVzKG5vZGVzKVxuICAgIC5saW5rcyhsaW5rcylcbiAgICAuZnJpY3Rpb24oMC44KVxuICAgIC5jaGFyZ2UoLTYwMClcbiAgICAuZ3Jhdml0eSgwLjEpXG4gICAgLmxpbmtEaXN0YW5jZShkID0+IHtcbiAgICAgIHJldHVybiBMRU5HVEhbZC50YXJnZXQudHlwZV0gKiBlbC5vZmZzZXRIZWlnaHQgLyA2MCArIGxpbmVMZW5ndGggKiAoZC5kaXN0YW5jZSB8fCAxKVxuICAgIH0pXG4gICAgLy8gLmxpbmtTdHJlbmd0aCgwLjAxKVxuICAgIC8vIC50aGV0YSgwLjgpXG4gICAgLy8gLmFscGhhKDAuMSlcbiAgICAuc3RhcnQoKVxufVxuXG5mdW5jdGlvbiBzaG9ydGVuTGlua3MobGluaywgZmlyc3QpIHtcbiAgY29uc3QgQVJST1dfT0ZGU0VUID0gOFxuICBsZXQgcmFkaXVzID0gZ2V0Tm9kZVJhZGl1cyhsaW5rLnRhcmdldClcbiAgbGV0IHggPSBsaW5rLnRhcmdldC54IC0gbGluay5zb3VyY2UueFxuICBsZXQgeSA9IGxpbmsudGFyZ2V0LnkgLSBsaW5rLnNvdXJjZS55XG4gIGxldCBkaXN0YW5jZSA9IE1hdGguc3FydCh4KnggKyB5KnkpXG4gIGxldCB0aGV0YSA9IE1hdGguYXRhbjIoeSx4KVxuICBpZihmaXJzdCkge1xuICAgIHJldHVybiBsaW5rLnNvdXJjZS54ICsgTWF0aC5jb3ModGhldGEpICogKGRpc3RhbmNlIC0gcmFkaXVzIC0gQVJST1dfT0ZGU0VUKVxuICB9IGVsc2Uge1xuICAgIHJldHVybiBsaW5rLnNvdXJjZS55ICsgTWF0aC5zaW4odGhldGEpICogKGRpc3RhbmNlIC0gcmFkaXVzIC0gQVJST1dfT0ZGU0VUKVxuICB9XG59XG5cbmZ1bmN0aW9uIHNldHVwRm9yY2VUaWNrIChncmFwaCkge1xuICBncmFwaC5mb3JjZS5vbihcInRpY2tcIiwgKCkgPT4ge1xuICAgIGdyYXBoLiRub2RlLmF0dHIoXCJ0cmFuc2Zvcm1cIiwgKGQpID0+IGB0cmFuc2xhdGUoJHtkLnh9LCR7ZC55fSlgKVxuICAgIGdyYXBoLiRsaW5rLnNlbGVjdCgnbGluZScpXG4gICAgICAuYXR0cihcIngxXCIsIGQgPT4gZC5zb3VyY2UueClcbiAgICAgIC5hdHRyKFwieTFcIiwgZCA9PiBkLnNvdXJjZS55KVxuICAgICAgLmF0dHIoXCJ4MlwiLCBkID0+IHNob3J0ZW5MaW5rcyhkLCB0cnVlKSlcbiAgICAgIC5hdHRyKFwieTJcIiwgZCA9PiBzaG9ydGVuTGlua3MoZCwgZmFsc2UpKVxuXG4gICAgZ3JhcGguJGxpbmsuc2VsZWN0KCd0ZXh0JylcbiAgICAgIC5zdHlsZShcInRyYW5zZm9ybVwiLCBkID0+IHtcbiAgICAgICAgbGV0IHggPSAoZC5zb3VyY2UueCArIGQudGFyZ2V0LngpIC8gMlxuICAgICAgICBsZXQgeSA9IChkLnNvdXJjZS55ICsgZC50YXJnZXQueSkgLyAyXG4gICAgICAgIGxldCBkeCA9IGQudGFyZ2V0LnggLSBkLnNvdXJjZS54XG4gICAgICAgIGxldCBkeSA9IGQudGFyZ2V0LnkgLSBkLnNvdXJjZS55XG4gICAgICAgIGxldCB0aGV0YSA9IE1hdGguYXRhbjIoZHksZHgpXG4gICAgICAgIHJldHVybiBgdHJhbnNsYXRlKCR7eH1weCwgJHt5fXB4KSByb3RhdGUoJHt0aGV0YX1yYWQpYFxuICAgICAgfSlcbiAgfSlcbn1cbiIsImNvbnN0IGNyb3Nzcm9hZHMgPSByZXF1aXJlKCdjcm9zc3JvYWRzJyk7XG5jb25zdCBoYXNoZXIgPSByZXF1aXJlKCdoYXNoZXInKTtcbmNvbnN0IHN0YXJ0VmlzdWFsaXphdGlvbiA9IHJlcXVpcmUoJy4vdmlzdWFsaXphdGlvbicpXG5jb25zdCBhY3Rpb25zID0gcmVxdWlyZSgnLi9hY3Rpb25zJylcblxubGV0IGRlc3Ryb3lQcmV2aW91c1Zpc3VhbGl6YXRpb24gPSAoKSA9PiB7fVxuXG5mdW5jdGlvbiBwYXJzZUhhc2ggKG5ld0hhc2gsIG9sZEhhc2gpIHtcbiAgY3Jvc3Nyb2Fkcy5wYXJzZShuZXdIYXNoKTtcbn1cblxuY3Jvc3Nyb2Fkcy5hZGRSb3V0ZSgnL3tuYW1lfScsIChuYW1lKSA9PiB7XG4gIGlmKCFhY3Rpb25zW25hbWVdKSB7XG4gICAgYWxlcnQoXCJDb3VsZCBub3QgZmluZCB0aGF0IHBhZ2UuXCIpXG4gICAgaGFzaGVyLnJlcGxhY2VIYXNoKCcnKTtcbiAgICByZXR1cm5cbiAgfVxuICBkZXN0cm95UHJldmlvdXNWaXN1YWxpemF0aW9uKClcbiAgZGVzdHJveVByZXZpb3VzVmlzdWFsaXphdGlvbiA9IHN0YXJ0VmlzdWFsaXphdGlvbihhY3Rpb25zW25hbWVdKVxufSk7XG5cbmNyb3Nzcm9hZHMuYWRkUm91dGUoLy4qLywgKCkgPT4ge1xuICBjb25zb2xlLmxvZygnbWFpbiByb3V0ZScpXG4gIGNvbnN0IGNvbnRhaW5lciA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5ub2RlJylcbiAgY29udGFpbmVyLmlubmVySFRNTCA9IGBcbiAgICA8ZGl2IGNsYXNzPSdtYWluLXRpdGxlcyc+XG4gICAgICA8aDEgY2xhc3M9J3RpdGxlLWhlYWRlcic+VW5kZXJzdGFuZGluZyBNZW1vcnkgaW4gSmF2YVNjcmlwdDwvaDE+XG4gICAgICA8cCBjbGFzcz0ndGl0bGUtc3ViaGVhZGVyJz5ieSBHcmVnIFRhdHVtPC9wPlxuICAgIDwvZGl2PlxuICBgXG4gIE9iamVjdC5rZXlzKGFjdGlvbnMpLmZvckVhY2goa2V5ID0+IHtcbiAgICBjb25zdCBkaXYgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKVxuICAgIGRpdi5pbm5lckhUTUwgPSBgXG4gICAgICA8YSBocmVmPScjLyR7a2V5fScgY2xhc3M9J3RpdGxlLWxpbmsnPiR7a2V5fTwvYT48YnIvPlxuICAgIGBcbiAgICBjb250YWluZXIuY2hpbGRyZW5bMF0uYXBwZW5kQ2hpbGQoZGl2KVxuICB9KVxuICBkZXN0cm95UHJldmlvdXNWaXN1YWxpemF0aW9uKClcbiAgZGVzdHJveVByZXZpb3VzVmlzdWFsaXphdGlvbiA9ICgpID0+IHtcbiAgICBjb25zdCBlbHMgPSBBcnJheS5mcm9tKGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJy5ub2RlID4gKicpKVxuICAgIGVscy5mb3JFYWNoKGVsID0+IGVsLnJlbW92ZSgpKVxuICB9XG59KTtcblxuaGFzaGVyLmluaXRpYWxpemVkLmFkZChwYXJzZUhhc2gpOyAvLyBwYXJzZSBpbml0aWFsIGhhc2hcbmhhc2hlci5jaGFuZ2VkLmFkZChwYXJzZUhhc2gpOyAvL3BhcnNlIGhhc2ggY2hhbmdlc1xuaGFzaGVyLmluaXQoKTsgLy9zdGFydCBsaXN0ZW5pbmcgZm9yIGhpc3RvcnkgY2hhbmdlXG4iXX0=
