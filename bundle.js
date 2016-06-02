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
myFunction = undefined;

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
    ["addNode", {display: "fn()", type: "object", id: "close"}],
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
  "map-cache" : require('./map-cache'),
  "weakmap-cache" : require('./weakmap-cache'),
}

},{"./accidental-globals":5,"./basics":6,"./bind-event":7,"./create-ten-elements":9,"./create-ten-elements-returns":8,"./directional":10,"./function-capture":11,"./handler-leak":13,"./handler-leak-fix":12,"./map-cache":15,"./weakmap-cache":16}],15:[function(require,module,exports){
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

},{}],17:[function(require,module,exports){
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

},{}],18:[function(require,module,exports){
module.exports = function type (graph, code) {
  const container = document.querySelector('.editor')
  graph.editor = CodeMirror(container, {
    value: code || "// No code provided",
    mode: "javascript",
    lineNumbers: true
  })

  graph.destroy.push(() => document.querySelector('.CodeMirror').remove())
}

},{}],19:[function(require,module,exports){
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

},{"./action-stepper":4,"./constants":17,"./editor":18}],20:[function(require,module,exports){
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
    <h1 class='title-header'>Understanding Memory in JavaScript</h1>
    <p class='title-subheader'>by Greg Tatum</p>
  `

  Object.keys(actions).forEach(key => {
    const div = document.createElement('div')
    div.innerHTML = `
      <a href='#/${key}' class='title-link'>${key}</a><br/>
    `
    container.appendChild(div)
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

},{"./actions":14,"./visualization":19,"crossroads":1,"hasher":2}]},{},[20])
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJub2RlX21vZHVsZXMvY3Jvc3Nyb2Fkcy9kaXN0L2Nyb3Nzcm9hZHMuanMiLCJub2RlX21vZHVsZXMvaGFzaGVyL2Rpc3QvanMvaGFzaGVyLmpzIiwibm9kZV9tb2R1bGVzL3NpZ25hbHMvZGlzdC9zaWduYWxzLmpzIiwic3JjL2FjdGlvbi1zdGVwcGVyLmpzIiwic3JjL2FjdGlvbnMvYWNjaWRlbnRhbC1nbG9iYWxzLmpzIiwic3JjL2FjdGlvbnMvYmFzaWNzLmpzIiwic3JjL2FjdGlvbnMvYmluZC1ldmVudC5qcyIsInNyYy9hY3Rpb25zL2NyZWF0ZS10ZW4tZWxlbWVudHMtcmV0dXJucy5qcyIsInNyYy9hY3Rpb25zL2NyZWF0ZS10ZW4tZWxlbWVudHMuanMiLCJzcmMvYWN0aW9ucy9kaXJlY3Rpb25hbC5qcyIsInNyYy9hY3Rpb25zL2Z1bmN0aW9uLWNhcHR1cmUuanMiLCJzcmMvYWN0aW9ucy9oYW5kbGVyLWxlYWstZml4LmpzIiwic3JjL2FjdGlvbnMvaGFuZGxlci1sZWFrLmpzIiwic3JjL2FjdGlvbnMvaW5kZXguanMiLCJzcmMvYWN0aW9ucy9tYXAtY2FjaGUuanMiLCJzcmMvYWN0aW9ucy93ZWFrbWFwLWNhY2hlLmpzIiwic3JjL2NvbnN0YW50cy5qcyIsInNyYy9lZGl0b3IuanMiLCJzcmMvdmlzdWFsaXphdGlvbi5qcyIsInNyYyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNydEJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3piQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzdiQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDckdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDckZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzFGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbEVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdEVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzNFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2xJQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzlGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ZHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzNLQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDeEdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM3QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNWQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMzTkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt2YXIgZj1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpO3Rocm93IGYuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixmfXZhciBsPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChsLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGwsbC5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLCIvKiogQGxpY2Vuc2VcbiAqIGNyb3Nzcm9hZHMgPGh0dHA6Ly9taWxsZXJtZWRlaXJvcy5naXRodWIuY29tL2Nyb3Nzcm9hZHMuanMvPlxuICogQXV0aG9yOiBNaWxsZXIgTWVkZWlyb3MgfCBNSVQgTGljZW5zZVxuICogdjAuMTIuMiAoMjAxNS8wNy8zMSAxODozNylcbiAqL1xuXG4oZnVuY3Rpb24gKCkge1xudmFyIGZhY3RvcnkgPSBmdW5jdGlvbiAoc2lnbmFscykge1xuXG4gICAgdmFyIGNyb3Nzcm9hZHMsXG4gICAgICAgIF9oYXNPcHRpb25hbEdyb3VwQnVnLFxuICAgICAgICBVTkRFRjtcblxuICAgIC8vIEhlbHBlcnMgLS0tLS0tLS0tLS1cbiAgICAvLz09PT09PT09PT09PT09PT09PT09XG5cbiAgICAvLyBJRSA3LTggY2FwdHVyZSBvcHRpb25hbCBncm91cHMgYXMgZW1wdHkgc3RyaW5ncyB3aGlsZSBvdGhlciBicm93c2Vyc1xuICAgIC8vIGNhcHR1cmUgYXMgYHVuZGVmaW5lZGBcbiAgICBfaGFzT3B0aW9uYWxHcm91cEJ1ZyA9ICgvdCguKyk/LykuZXhlYygndCcpWzFdID09PSAnJztcblxuICAgIGZ1bmN0aW9uIGFycmF5SW5kZXhPZihhcnIsIHZhbCkge1xuICAgICAgICBpZiAoYXJyLmluZGV4T2YpIHtcbiAgICAgICAgICAgIHJldHVybiBhcnIuaW5kZXhPZih2YWwpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgLy9BcnJheS5pbmRleE9mIGRvZXNuJ3Qgd29yayBvbiBJRSA2LTdcbiAgICAgICAgICAgIHZhciBuID0gYXJyLmxlbmd0aDtcbiAgICAgICAgICAgIHdoaWxlIChuLS0pIHtcbiAgICAgICAgICAgICAgICBpZiAoYXJyW25dID09PSB2YWwpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIG47XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIC0xO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gYXJyYXlSZW1vdmUoYXJyLCBpdGVtKSB7XG4gICAgICAgIHZhciBpID0gYXJyYXlJbmRleE9mKGFyciwgaXRlbSk7XG4gICAgICAgIGlmIChpICE9PSAtMSkge1xuICAgICAgICAgICAgYXJyLnNwbGljZShpLCAxKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIGlzS2luZCh2YWwsIGtpbmQpIHtcbiAgICAgICAgcmV0dXJuICdbb2JqZWN0ICcrIGtpbmQgKyddJyA9PT0gT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKHZhbCk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gaXNSZWdFeHAodmFsKSB7XG4gICAgICAgIHJldHVybiBpc0tpbmQodmFsLCAnUmVnRXhwJyk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gaXNBcnJheSh2YWwpIHtcbiAgICAgICAgcmV0dXJuIGlzS2luZCh2YWwsICdBcnJheScpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGlzRnVuY3Rpb24odmFsKSB7XG4gICAgICAgIHJldHVybiB0eXBlb2YgdmFsID09PSAnZnVuY3Rpb24nO1xuICAgIH1cblxuICAgIC8vYm9ycm93ZWQgZnJvbSBBTUQtdXRpbHNcbiAgICBmdW5jdGlvbiB0eXBlY2FzdFZhbHVlKHZhbCkge1xuICAgICAgICB2YXIgcjtcbiAgICAgICAgaWYgKHZhbCA9PT0gbnVsbCB8fCB2YWwgPT09ICdudWxsJykge1xuICAgICAgICAgICAgciA9IG51bGw7XG4gICAgICAgIH0gZWxzZSBpZiAodmFsID09PSAndHJ1ZScpIHtcbiAgICAgICAgICAgIHIgPSB0cnVlO1xuICAgICAgICB9IGVsc2UgaWYgKHZhbCA9PT0gJ2ZhbHNlJykge1xuICAgICAgICAgICAgciA9IGZhbHNlO1xuICAgICAgICB9IGVsc2UgaWYgKHZhbCA9PT0gVU5ERUYgfHwgdmFsID09PSAndW5kZWZpbmVkJykge1xuICAgICAgICAgICAgciA9IFVOREVGO1xuICAgICAgICB9IGVsc2UgaWYgKHZhbCA9PT0gJycgfHwgaXNOYU4odmFsKSkge1xuICAgICAgICAgICAgLy9pc05hTignJykgcmV0dXJucyBmYWxzZVxuICAgICAgICAgICAgciA9IHZhbDtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIC8vcGFyc2VGbG9hdChudWxsIHx8ICcnKSByZXR1cm5zIE5hTlxuICAgICAgICAgICAgciA9IHBhcnNlRmxvYXQodmFsKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gcjtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiB0eXBlY2FzdEFycmF5VmFsdWVzKHZhbHVlcykge1xuICAgICAgICB2YXIgbiA9IHZhbHVlcy5sZW5ndGgsXG4gICAgICAgICAgICByZXN1bHQgPSBbXTtcbiAgICAgICAgd2hpbGUgKG4tLSkge1xuICAgICAgICAgICAgcmVzdWx0W25dID0gdHlwZWNhc3RWYWx1ZSh2YWx1ZXNbbl0pO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfVxuXG4gICAgLy8gYm9ycm93ZWQgZnJvbSBNT1VUXG4gICAgZnVuY3Rpb24gZGVjb2RlUXVlcnlTdHJpbmcocXVlcnlTdHIsIHNob3VsZFR5cGVjYXN0KSB7XG4gICAgICAgIHZhciBxdWVyeUFyciA9IChxdWVyeVN0ciB8fCAnJykucmVwbGFjZSgnPycsICcnKS5zcGxpdCgnJicpLFxuICAgICAgICAgICAgcmVnID0gLyhbXj1dKyk9KC4rKS8sXG4gICAgICAgICAgICBpID0gLTEsXG4gICAgICAgICAgICBvYmogPSB7fSxcbiAgICAgICAgICAgIGVxdWFsSW5kZXgsIGN1ciwgcFZhbHVlLCBwTmFtZTtcblxuICAgICAgICB3aGlsZSAoKGN1ciA9IHF1ZXJ5QXJyWysraV0pKSB7XG4gICAgICAgICAgICBlcXVhbEluZGV4ID0gY3VyLmluZGV4T2YoJz0nKTtcbiAgICAgICAgICAgIHBOYW1lID0gY3VyLnN1YnN0cmluZygwLCBlcXVhbEluZGV4KTtcbiAgICAgICAgICAgIHBWYWx1ZSA9IGRlY29kZVVSSUNvbXBvbmVudChjdXIuc3Vic3RyaW5nKGVxdWFsSW5kZXggKyAxKSk7XG4gICAgICAgICAgICBpZiAoc2hvdWxkVHlwZWNhc3QgIT09IGZhbHNlKSB7XG4gICAgICAgICAgICAgICAgcFZhbHVlID0gdHlwZWNhc3RWYWx1ZShwVmFsdWUpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHBOYW1lIGluIG9iail7XG4gICAgICAgICAgICAgICAgaWYoaXNBcnJheShvYmpbcE5hbWVdKSl7XG4gICAgICAgICAgICAgICAgICAgIG9ialtwTmFtZV0ucHVzaChwVmFsdWUpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIG9ialtwTmFtZV0gPSBbb2JqW3BOYW1lXSwgcFZhbHVlXTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIG9ialtwTmFtZV0gPSBwVmFsdWU7XG4gICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gb2JqO1xuICAgIH1cblxuXG4gICAgLy8gQ3Jvc3Nyb2FkcyAtLS0tLS0tLVxuICAgIC8vPT09PT09PT09PT09PT09PT09PT1cblxuICAgIC8qKlxuICAgICAqIEBjb25zdHJ1Y3RvclxuICAgICAqL1xuICAgIGZ1bmN0aW9uIENyb3Nzcm9hZHMoKSB7XG4gICAgICAgIHRoaXMuYnlwYXNzZWQgPSBuZXcgc2lnbmFscy5TaWduYWwoKTtcbiAgICAgICAgdGhpcy5yb3V0ZWQgPSBuZXcgc2lnbmFscy5TaWduYWwoKTtcbiAgICAgICAgdGhpcy5fcm91dGVzID0gW107XG4gICAgICAgIHRoaXMuX3ByZXZSb3V0ZXMgPSBbXTtcbiAgICAgICAgdGhpcy5fcGlwZWQgPSBbXTtcbiAgICAgICAgdGhpcy5yZXNldFN0YXRlKCk7XG4gICAgfVxuXG4gICAgQ3Jvc3Nyb2Fkcy5wcm90b3R5cGUgPSB7XG5cbiAgICAgICAgZ3JlZWR5IDogZmFsc2UsXG5cbiAgICAgICAgZ3JlZWR5RW5hYmxlZCA6IHRydWUsXG5cbiAgICAgICAgaWdub3JlQ2FzZSA6IHRydWUsXG5cbiAgICAgICAgaWdub3JlU3RhdGUgOiBmYWxzZSxcblxuICAgICAgICBzaG91bGRUeXBlY2FzdCA6IGZhbHNlLFxuXG4gICAgICAgIG5vcm1hbGl6ZUZuIDogbnVsbCxcblxuICAgICAgICByZXNldFN0YXRlIDogZnVuY3Rpb24oKXtcbiAgICAgICAgICAgIHRoaXMuX3ByZXZSb3V0ZXMubGVuZ3RoID0gMDtcbiAgICAgICAgICAgIHRoaXMuX3ByZXZNYXRjaGVkUmVxdWVzdCA9IG51bGw7XG4gICAgICAgICAgICB0aGlzLl9wcmV2QnlwYXNzZWRSZXF1ZXN0ID0gbnVsbDtcbiAgICAgICAgfSxcblxuICAgICAgICBjcmVhdGUgOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICByZXR1cm4gbmV3IENyb3Nzcm9hZHMoKTtcbiAgICAgICAgfSxcblxuICAgICAgICBhZGRSb3V0ZSA6IGZ1bmN0aW9uIChwYXR0ZXJuLCBjYWxsYmFjaywgcHJpb3JpdHkpIHtcbiAgICAgICAgICAgIHZhciByb3V0ZSA9IG5ldyBSb3V0ZShwYXR0ZXJuLCBjYWxsYmFjaywgcHJpb3JpdHksIHRoaXMpO1xuICAgICAgICAgICAgdGhpcy5fc29ydGVkSW5zZXJ0KHJvdXRlKTtcbiAgICAgICAgICAgIHJldHVybiByb3V0ZTtcbiAgICAgICAgfSxcblxuICAgICAgICByZW1vdmVSb3V0ZSA6IGZ1bmN0aW9uIChyb3V0ZSkge1xuICAgICAgICAgICAgYXJyYXlSZW1vdmUodGhpcy5fcm91dGVzLCByb3V0ZSk7XG4gICAgICAgICAgICByb3V0ZS5fZGVzdHJveSgpO1xuICAgICAgICB9LFxuXG4gICAgICAgIHJlbW92ZUFsbFJvdXRlcyA6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHZhciBuID0gdGhpcy5nZXROdW1Sb3V0ZXMoKTtcbiAgICAgICAgICAgIHdoaWxlIChuLS0pIHtcbiAgICAgICAgICAgICAgICB0aGlzLl9yb3V0ZXNbbl0uX2Rlc3Ryb3koKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoaXMuX3JvdXRlcy5sZW5ndGggPSAwO1xuICAgICAgICB9LFxuXG4gICAgICAgIHBhcnNlIDogZnVuY3Rpb24gKHJlcXVlc3QsIGRlZmF1bHRBcmdzKSB7XG4gICAgICAgICAgICByZXF1ZXN0ID0gcmVxdWVzdCB8fCAnJztcbiAgICAgICAgICAgIGRlZmF1bHRBcmdzID0gZGVmYXVsdEFyZ3MgfHwgW107XG5cbiAgICAgICAgICAgIC8vIHNob3VsZCBvbmx5IGNhcmUgYWJvdXQgZGlmZmVyZW50IHJlcXVlc3RzIGlmIGlnbm9yZVN0YXRlIGlzbid0IHRydWVcbiAgICAgICAgICAgIGlmICggIXRoaXMuaWdub3JlU3RhdGUgJiZcbiAgICAgICAgICAgICAgICAocmVxdWVzdCA9PT0gdGhpcy5fcHJldk1hdGNoZWRSZXF1ZXN0IHx8XG4gICAgICAgICAgICAgICAgIHJlcXVlc3QgPT09IHRoaXMuX3ByZXZCeXBhc3NlZFJlcXVlc3QpICkge1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdmFyIHJvdXRlcyA9IHRoaXMuX2dldE1hdGNoZWRSb3V0ZXMocmVxdWVzdCksXG4gICAgICAgICAgICAgICAgaSA9IDAsXG4gICAgICAgICAgICAgICAgbiA9IHJvdXRlcy5sZW5ndGgsXG4gICAgICAgICAgICAgICAgY3VyO1xuXG4gICAgICAgICAgICBpZiAobikge1xuICAgICAgICAgICAgICAgIHRoaXMuX3ByZXZNYXRjaGVkUmVxdWVzdCA9IHJlcXVlc3Q7XG5cbiAgICAgICAgICAgICAgICB0aGlzLl9ub3RpZnlQcmV2Um91dGVzKHJvdXRlcywgcmVxdWVzdCk7XG4gICAgICAgICAgICAgICAgdGhpcy5fcHJldlJvdXRlcyA9IHJvdXRlcztcbiAgICAgICAgICAgICAgICAvL3Nob3VsZCBiZSBpbmNyZW1lbnRhbCBsb29wLCBleGVjdXRlIHJvdXRlcyBpbiBvcmRlclxuICAgICAgICAgICAgICAgIHdoaWxlIChpIDwgbikge1xuICAgICAgICAgICAgICAgICAgICBjdXIgPSByb3V0ZXNbaV07XG4gICAgICAgICAgICAgICAgICAgIGN1ci5yb3V0ZS5tYXRjaGVkLmRpc3BhdGNoLmFwcGx5KGN1ci5yb3V0ZS5tYXRjaGVkLCBkZWZhdWx0QXJncy5jb25jYXQoY3VyLnBhcmFtcykpO1xuICAgICAgICAgICAgICAgICAgICBjdXIuaXNGaXJzdCA9ICFpO1xuICAgICAgICAgICAgICAgICAgICB0aGlzLnJvdXRlZC5kaXNwYXRjaC5hcHBseSh0aGlzLnJvdXRlZCwgZGVmYXVsdEFyZ3MuY29uY2F0KFtyZXF1ZXN0LCBjdXJdKSk7XG4gICAgICAgICAgICAgICAgICAgIGkgKz0gMTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHRoaXMuX3ByZXZCeXBhc3NlZFJlcXVlc3QgPSByZXF1ZXN0O1xuICAgICAgICAgICAgICAgIHRoaXMuYnlwYXNzZWQuZGlzcGF0Y2guYXBwbHkodGhpcy5ieXBhc3NlZCwgZGVmYXVsdEFyZ3MuY29uY2F0KFtyZXF1ZXN0XSkpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB0aGlzLl9waXBlUGFyc2UocmVxdWVzdCwgZGVmYXVsdEFyZ3MpO1xuICAgICAgICB9LFxuXG4gICAgICAgIF9ub3RpZnlQcmV2Um91dGVzIDogZnVuY3Rpb24obWF0Y2hlZFJvdXRlcywgcmVxdWVzdCkge1xuICAgICAgICAgICAgdmFyIGkgPSAwLCBwcmV2O1xuICAgICAgICAgICAgd2hpbGUgKHByZXYgPSB0aGlzLl9wcmV2Um91dGVzW2krK10pIHtcbiAgICAgICAgICAgICAgICAvL2NoZWNrIGlmIHN3aXRjaGVkIGV4aXN0IHNpbmNlIHJvdXRlIG1heSBiZSBkaXNwb3NlZFxuICAgICAgICAgICAgICAgIGlmKHByZXYucm91dGUuc3dpdGNoZWQgJiYgdGhpcy5fZGlkU3dpdGNoKHByZXYucm91dGUsIG1hdGNoZWRSb3V0ZXMpKSB7XG4gICAgICAgICAgICAgICAgICAgIHByZXYucm91dGUuc3dpdGNoZWQuZGlzcGF0Y2gocmVxdWVzdCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9LFxuXG4gICAgICAgIF9kaWRTd2l0Y2ggOiBmdW5jdGlvbiAocm91dGUsIG1hdGNoZWRSb3V0ZXMpe1xuICAgICAgICAgICAgdmFyIG1hdGNoZWQsXG4gICAgICAgICAgICAgICAgaSA9IDA7XG4gICAgICAgICAgICB3aGlsZSAobWF0Y2hlZCA9IG1hdGNoZWRSb3V0ZXNbaSsrXSkge1xuICAgICAgICAgICAgICAgIC8vIG9ubHkgZGlzcGF0Y2ggc3dpdGNoZWQgaWYgaXQgaXMgZ29pbmcgdG8gYSBkaWZmZXJlbnQgcm91dGVcbiAgICAgICAgICAgICAgICBpZiAobWF0Y2hlZC5yb3V0ZSA9PT0gcm91dGUpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9LFxuXG4gICAgICAgIF9waXBlUGFyc2UgOiBmdW5jdGlvbihyZXF1ZXN0LCBkZWZhdWx0QXJncykge1xuICAgICAgICAgICAgdmFyIGkgPSAwLCByb3V0ZTtcbiAgICAgICAgICAgIHdoaWxlIChyb3V0ZSA9IHRoaXMuX3BpcGVkW2krK10pIHtcbiAgICAgICAgICAgICAgICByb3V0ZS5wYXJzZShyZXF1ZXN0LCBkZWZhdWx0QXJncyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sXG5cbiAgICAgICAgZ2V0TnVtUm91dGVzIDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuX3JvdXRlcy5sZW5ndGg7XG4gICAgICAgIH0sXG5cbiAgICAgICAgX3NvcnRlZEluc2VydCA6IGZ1bmN0aW9uIChyb3V0ZSkge1xuICAgICAgICAgICAgLy9zaW1wbGlmaWVkIGluc2VydGlvbiBzb3J0XG4gICAgICAgICAgICB2YXIgcm91dGVzID0gdGhpcy5fcm91dGVzLFxuICAgICAgICAgICAgICAgIG4gPSByb3V0ZXMubGVuZ3RoO1xuICAgICAgICAgICAgZG8geyAtLW47IH0gd2hpbGUgKHJvdXRlc1tuXSAmJiByb3V0ZS5fcHJpb3JpdHkgPD0gcm91dGVzW25dLl9wcmlvcml0eSk7XG4gICAgICAgICAgICByb3V0ZXMuc3BsaWNlKG4rMSwgMCwgcm91dGUpO1xuICAgICAgICB9LFxuXG4gICAgICAgIF9nZXRNYXRjaGVkUm91dGVzIDogZnVuY3Rpb24gKHJlcXVlc3QpIHtcbiAgICAgICAgICAgIHZhciByZXMgPSBbXSxcbiAgICAgICAgICAgICAgICByb3V0ZXMgPSB0aGlzLl9yb3V0ZXMsXG4gICAgICAgICAgICAgICAgbiA9IHJvdXRlcy5sZW5ndGgsXG4gICAgICAgICAgICAgICAgcm91dGU7XG4gICAgICAgICAgICAvL3Nob3VsZCBiZSBkZWNyZW1lbnQgbG9vcCBzaW5jZSBoaWdoZXIgcHJpb3JpdGllcyBhcmUgYWRkZWQgYXQgdGhlIGVuZCBvZiBhcnJheVxuICAgICAgICAgICAgd2hpbGUgKHJvdXRlID0gcm91dGVzWy0tbl0pIHtcbiAgICAgICAgICAgICAgICBpZiAoKCFyZXMubGVuZ3RoIHx8IHRoaXMuZ3JlZWR5IHx8IHJvdXRlLmdyZWVkeSkgJiYgcm91dGUubWF0Y2gocmVxdWVzdCkpIHtcbiAgICAgICAgICAgICAgICAgICAgcmVzLnB1c2goe1xuICAgICAgICAgICAgICAgICAgICAgICAgcm91dGUgOiByb3V0ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHBhcmFtcyA6IHJvdXRlLl9nZXRQYXJhbXNBcnJheShyZXF1ZXN0KVxuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaWYgKCF0aGlzLmdyZWVkeUVuYWJsZWQgJiYgcmVzLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gcmVzO1xuICAgICAgICB9LFxuXG4gICAgICAgIHBpcGUgOiBmdW5jdGlvbiAob3RoZXJSb3V0ZXIpIHtcbiAgICAgICAgICAgIHRoaXMuX3BpcGVkLnB1c2gob3RoZXJSb3V0ZXIpO1xuICAgICAgICB9LFxuXG4gICAgICAgIHVucGlwZSA6IGZ1bmN0aW9uIChvdGhlclJvdXRlcikge1xuICAgICAgICAgICAgYXJyYXlSZW1vdmUodGhpcy5fcGlwZWQsIG90aGVyUm91dGVyKTtcbiAgICAgICAgfSxcblxuICAgICAgICB0b1N0cmluZyA6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHJldHVybiAnW2Nyb3Nzcm9hZHMgbnVtUm91dGVzOicrIHRoaXMuZ2V0TnVtUm91dGVzKCkgKyddJztcbiAgICAgICAgfVxuICAgIH07XG5cbiAgICAvL1wic3RhdGljXCIgaW5zdGFuY2VcbiAgICBjcm9zc3JvYWRzID0gbmV3IENyb3Nzcm9hZHMoKTtcbiAgICBjcm9zc3JvYWRzLlZFUlNJT04gPSAnMC4xMi4yJztcblxuICAgIGNyb3Nzcm9hZHMuTk9STV9BU19BUlJBWSA9IGZ1bmN0aW9uIChyZXEsIHZhbHMpIHtcbiAgICAgICAgcmV0dXJuIFt2YWxzLnZhbHNfXTtcbiAgICB9O1xuXG4gICAgY3Jvc3Nyb2Fkcy5OT1JNX0FTX09CSkVDVCA9IGZ1bmN0aW9uIChyZXEsIHZhbHMpIHtcbiAgICAgICAgcmV0dXJuIFt2YWxzXTtcbiAgICB9O1xuXG5cbiAgICAvLyBSb3V0ZSAtLS0tLS0tLS0tLS0tLVxuICAgIC8vPT09PT09PT09PT09PT09PT09PT09XG5cbiAgICAvKipcbiAgICAgKiBAY29uc3RydWN0b3JcbiAgICAgKi9cbiAgICBmdW5jdGlvbiBSb3V0ZShwYXR0ZXJuLCBjYWxsYmFjaywgcHJpb3JpdHksIHJvdXRlcikge1xuICAgICAgICB2YXIgaXNSZWdleFBhdHRlcm4gPSBpc1JlZ0V4cChwYXR0ZXJuKSxcbiAgICAgICAgICAgIHBhdHRlcm5MZXhlciA9IHJvdXRlci5wYXR0ZXJuTGV4ZXI7XG4gICAgICAgIHRoaXMuX3JvdXRlciA9IHJvdXRlcjtcbiAgICAgICAgdGhpcy5fcGF0dGVybiA9IHBhdHRlcm47XG4gICAgICAgIHRoaXMuX3BhcmFtc0lkcyA9IGlzUmVnZXhQYXR0ZXJuPyBudWxsIDogcGF0dGVybkxleGVyLmdldFBhcmFtSWRzKHBhdHRlcm4pO1xuICAgICAgICB0aGlzLl9vcHRpb25hbFBhcmFtc0lkcyA9IGlzUmVnZXhQYXR0ZXJuPyBudWxsIDogcGF0dGVybkxleGVyLmdldE9wdGlvbmFsUGFyYW1zSWRzKHBhdHRlcm4pO1xuICAgICAgICB0aGlzLl9tYXRjaFJlZ2V4cCA9IGlzUmVnZXhQYXR0ZXJuPyBwYXR0ZXJuIDogcGF0dGVybkxleGVyLmNvbXBpbGVQYXR0ZXJuKHBhdHRlcm4sIHJvdXRlci5pZ25vcmVDYXNlKTtcbiAgICAgICAgdGhpcy5tYXRjaGVkID0gbmV3IHNpZ25hbHMuU2lnbmFsKCk7XG4gICAgICAgIHRoaXMuc3dpdGNoZWQgPSBuZXcgc2lnbmFscy5TaWduYWwoKTtcbiAgICAgICAgaWYgKGNhbGxiYWNrKSB7XG4gICAgICAgICAgICB0aGlzLm1hdGNoZWQuYWRkKGNhbGxiYWNrKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLl9wcmlvcml0eSA9IHByaW9yaXR5IHx8IDA7XG4gICAgfVxuXG4gICAgUm91dGUucHJvdG90eXBlID0ge1xuXG4gICAgICAgIGdyZWVkeSA6IGZhbHNlLFxuXG4gICAgICAgIHJ1bGVzIDogdm9pZCgwKSxcblxuICAgICAgICBtYXRjaCA6IGZ1bmN0aW9uIChyZXF1ZXN0KSB7XG4gICAgICAgICAgICByZXF1ZXN0ID0gcmVxdWVzdCB8fCAnJztcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl9tYXRjaFJlZ2V4cC50ZXN0KHJlcXVlc3QpICYmIHRoaXMuX3ZhbGlkYXRlUGFyYW1zKHJlcXVlc3QpOyAvL3ZhbGlkYXRlIHBhcmFtcyBldmVuIGlmIHJlZ2V4cCBiZWNhdXNlIG9mIGByZXF1ZXN0X2AgcnVsZS5cbiAgICAgICAgfSxcblxuICAgICAgICBfdmFsaWRhdGVQYXJhbXMgOiBmdW5jdGlvbiAocmVxdWVzdCkge1xuICAgICAgICAgICAgdmFyIHJ1bGVzID0gdGhpcy5ydWxlcyxcbiAgICAgICAgICAgICAgICB2YWx1ZXMgPSB0aGlzLl9nZXRQYXJhbXNPYmplY3QocmVxdWVzdCksXG4gICAgICAgICAgICAgICAga2V5O1xuICAgICAgICAgICAgZm9yIChrZXkgaW4gcnVsZXMpIHtcbiAgICAgICAgICAgICAgICAvLyBub3JtYWxpemVfIGlzbid0IGEgdmFsaWRhdGlvbiBydWxlLi4uICgjMzkpXG4gICAgICAgICAgICAgICAgaWYoa2V5ICE9PSAnbm9ybWFsaXplXycgJiYgcnVsZXMuaGFzT3duUHJvcGVydHkoa2V5KSAmJiAhIHRoaXMuX2lzVmFsaWRQYXJhbShyZXF1ZXN0LCBrZXksIHZhbHVlcykpe1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH0sXG5cbiAgICAgICAgX2lzVmFsaWRQYXJhbSA6IGZ1bmN0aW9uIChyZXF1ZXN0LCBwcm9wLCB2YWx1ZXMpIHtcbiAgICAgICAgICAgIHZhciB2YWxpZGF0aW9uUnVsZSA9IHRoaXMucnVsZXNbcHJvcF0sXG4gICAgICAgICAgICAgICAgdmFsID0gdmFsdWVzW3Byb3BdLFxuICAgICAgICAgICAgICAgIGlzVmFsaWQgPSBmYWxzZSxcbiAgICAgICAgICAgICAgICBpc1F1ZXJ5ID0gKHByb3AuaW5kZXhPZignPycpID09PSAwKTtcblxuICAgICAgICAgICAgaWYgKHZhbCA9PSBudWxsICYmIHRoaXMuX29wdGlvbmFsUGFyYW1zSWRzICYmIGFycmF5SW5kZXhPZih0aGlzLl9vcHRpb25hbFBhcmFtc0lkcywgcHJvcCkgIT09IC0xKSB7XG4gICAgICAgICAgICAgICAgaXNWYWxpZCA9IHRydWU7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIGlmIChpc1JlZ0V4cCh2YWxpZGF0aW9uUnVsZSkpIHtcbiAgICAgICAgICAgICAgICBpZiAoaXNRdWVyeSkge1xuICAgICAgICAgICAgICAgICAgICB2YWwgPSB2YWx1ZXNbcHJvcCArJ18nXTsgLy91c2UgcmF3IHN0cmluZ1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpc1ZhbGlkID0gdmFsaWRhdGlvblJ1bGUudGVzdCh2YWwpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSBpZiAoaXNBcnJheSh2YWxpZGF0aW9uUnVsZSkpIHtcbiAgICAgICAgICAgICAgICBpZiAoaXNRdWVyeSkge1xuICAgICAgICAgICAgICAgICAgICB2YWwgPSB2YWx1ZXNbcHJvcCArJ18nXTsgLy91c2UgcmF3IHN0cmluZ1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpc1ZhbGlkID0gdGhpcy5faXNWYWxpZEFycmF5UnVsZSh2YWxpZGF0aW9uUnVsZSwgdmFsKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2UgaWYgKGlzRnVuY3Rpb24odmFsaWRhdGlvblJ1bGUpKSB7XG4gICAgICAgICAgICAgICAgaXNWYWxpZCA9IHZhbGlkYXRpb25SdWxlKHZhbCwgcmVxdWVzdCwgdmFsdWVzKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmV0dXJuIGlzVmFsaWQ7IC8vZmFpbCBzaWxlbnRseSBpZiB2YWxpZGF0aW9uUnVsZSBpcyBmcm9tIGFuIHVuc3VwcG9ydGVkIHR5cGVcbiAgICAgICAgfSxcblxuICAgICAgICBfaXNWYWxpZEFycmF5UnVsZSA6IGZ1bmN0aW9uIChhcnIsIHZhbCkge1xuICAgICAgICAgICAgaWYgKCEgdGhpcy5fcm91dGVyLmlnbm9yZUNhc2UpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gYXJyYXlJbmRleE9mKGFyciwgdmFsKSAhPT0gLTE7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmICh0eXBlb2YgdmFsID09PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgICAgIHZhbCA9IHZhbC50b0xvd2VyQ2FzZSgpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB2YXIgbiA9IGFyci5sZW5ndGgsXG4gICAgICAgICAgICAgICAgaXRlbSxcbiAgICAgICAgICAgICAgICBjb21wYXJlVmFsO1xuXG4gICAgICAgICAgICB3aGlsZSAobi0tKSB7XG4gICAgICAgICAgICAgICAgaXRlbSA9IGFycltuXTtcbiAgICAgICAgICAgICAgICBjb21wYXJlVmFsID0gKHR5cGVvZiBpdGVtID09PSAnc3RyaW5nJyk/IGl0ZW0udG9Mb3dlckNhc2UoKSA6IGl0ZW07XG4gICAgICAgICAgICAgICAgaWYgKGNvbXBhcmVWYWwgPT09IHZhbCkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH0sXG5cbiAgICAgICAgX2dldFBhcmFtc09iamVjdCA6IGZ1bmN0aW9uIChyZXF1ZXN0KSB7XG4gICAgICAgICAgICB2YXIgc2hvdWxkVHlwZWNhc3QgPSB0aGlzLl9yb3V0ZXIuc2hvdWxkVHlwZWNhc3QsXG4gICAgICAgICAgICAgICAgdmFsdWVzID0gdGhpcy5fcm91dGVyLnBhdHRlcm5MZXhlci5nZXRQYXJhbVZhbHVlcyhyZXF1ZXN0LCB0aGlzLl9tYXRjaFJlZ2V4cCwgc2hvdWxkVHlwZWNhc3QpLFxuICAgICAgICAgICAgICAgIG8gPSB7fSxcbiAgICAgICAgICAgICAgICBuID0gdmFsdWVzLmxlbmd0aCxcbiAgICAgICAgICAgICAgICBwYXJhbSwgdmFsO1xuICAgICAgICAgICAgd2hpbGUgKG4tLSkge1xuICAgICAgICAgICAgICAgIHZhbCA9IHZhbHVlc1tuXTtcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5fcGFyYW1zSWRzKSB7XG4gICAgICAgICAgICAgICAgICAgIHBhcmFtID0gdGhpcy5fcGFyYW1zSWRzW25dO1xuICAgICAgICAgICAgICAgICAgICBpZiAocGFyYW0uaW5kZXhPZignPycpID09PSAwICYmIHZhbCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgLy9tYWtlIGEgY29weSBvZiB0aGUgb3JpZ2luYWwgc3RyaW5nIHNvIGFycmF5IGFuZFxuICAgICAgICAgICAgICAgICAgICAgICAgLy9SZWdFeHAgdmFsaWRhdGlvbiBjYW4gYmUgYXBwbGllZCBwcm9wZXJseVxuICAgICAgICAgICAgICAgICAgICAgICAgb1twYXJhbSArJ18nXSA9IHZhbDtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vdXBkYXRlIHZhbHNfIGFycmF5IGFzIHdlbGwgc2luY2UgaXQgd2lsbCBiZSB1c2VkXG4gICAgICAgICAgICAgICAgICAgICAgICAvL2R1cmluZyBkaXNwYXRjaFxuICAgICAgICAgICAgICAgICAgICAgICAgdmFsID0gZGVjb2RlUXVlcnlTdHJpbmcodmFsLCBzaG91bGRUeXBlY2FzdCk7XG4gICAgICAgICAgICAgICAgICAgICAgICB2YWx1ZXNbbl0gPSB2YWw7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgLy8gSUUgd2lsbCBjYXB0dXJlIG9wdGlvbmFsIGdyb3VwcyBhcyBlbXB0eSBzdHJpbmdzIHdoaWxlIG90aGVyXG4gICAgICAgICAgICAgICAgICAgIC8vIGJyb3dzZXJzIHdpbGwgY2FwdHVyZSBgdW5kZWZpbmVkYCBzbyBub3JtYWxpemUgYmVoYXZpb3IuXG4gICAgICAgICAgICAgICAgICAgIC8vIHNlZTogI2doLTU4LCAjZ2gtNTksICNnaC02MFxuICAgICAgICAgICAgICAgICAgICBpZiAoIF9oYXNPcHRpb25hbEdyb3VwQnVnICYmIHZhbCA9PT0gJycgJiYgYXJyYXlJbmRleE9mKHRoaXMuX29wdGlvbmFsUGFyYW1zSWRzLCBwYXJhbSkgIT09IC0xICkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdmFsID0gdm9pZCgwKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhbHVlc1tuXSA9IHZhbDtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBvW3BhcmFtXSA9IHZhbDtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgLy9hbGlhcyB0byBwYXRocyBhbmQgZm9yIFJlZ0V4cCBwYXR0ZXJuXG4gICAgICAgICAgICAgICAgb1tuXSA9IHZhbDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIG8ucmVxdWVzdF8gPSBzaG91bGRUeXBlY2FzdD8gdHlwZWNhc3RWYWx1ZShyZXF1ZXN0KSA6IHJlcXVlc3Q7XG4gICAgICAgICAgICBvLnZhbHNfID0gdmFsdWVzO1xuICAgICAgICAgICAgcmV0dXJuIG87XG4gICAgICAgIH0sXG5cbiAgICAgICAgX2dldFBhcmFtc0FycmF5IDogZnVuY3Rpb24gKHJlcXVlc3QpIHtcbiAgICAgICAgICAgIHZhciBub3JtID0gdGhpcy5ydWxlcz8gdGhpcy5ydWxlcy5ub3JtYWxpemVfIDogbnVsbCxcbiAgICAgICAgICAgICAgICBwYXJhbXM7XG4gICAgICAgICAgICBub3JtID0gbm9ybSB8fCB0aGlzLl9yb3V0ZXIubm9ybWFsaXplRm47IC8vIGRlZmF1bHQgbm9ybWFsaXplXG4gICAgICAgICAgICBpZiAobm9ybSAmJiBpc0Z1bmN0aW9uKG5vcm0pKSB7XG4gICAgICAgICAgICAgICAgcGFyYW1zID0gbm9ybShyZXF1ZXN0LCB0aGlzLl9nZXRQYXJhbXNPYmplY3QocmVxdWVzdCkpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBwYXJhbXMgPSB0aGlzLl9nZXRQYXJhbXNPYmplY3QocmVxdWVzdCkudmFsc187XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gcGFyYW1zO1xuICAgICAgICB9LFxuXG4gICAgICAgIGludGVycG9sYXRlIDogZnVuY3Rpb24ocmVwbGFjZW1lbnRzKSB7XG4gICAgICAgICAgICB2YXIgc3RyID0gdGhpcy5fcm91dGVyLnBhdHRlcm5MZXhlci5pbnRlcnBvbGF0ZSh0aGlzLl9wYXR0ZXJuLCByZXBsYWNlbWVudHMpO1xuICAgICAgICAgICAgaWYgKCEgdGhpcy5fdmFsaWRhdGVQYXJhbXMoc3RyKSApIHtcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0dlbmVyYXRlZCBzdHJpbmcgZG9lc25cXCd0IHZhbGlkYXRlIGFnYWluc3QgYFJvdXRlLnJ1bGVzYC4nKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBzdHI7XG4gICAgICAgIH0sXG5cbiAgICAgICAgZGlzcG9zZSA6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHRoaXMuX3JvdXRlci5yZW1vdmVSb3V0ZSh0aGlzKTtcbiAgICAgICAgfSxcblxuICAgICAgICBfZGVzdHJveSA6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHRoaXMubWF0Y2hlZC5kaXNwb3NlKCk7XG4gICAgICAgICAgICB0aGlzLnN3aXRjaGVkLmRpc3Bvc2UoKTtcbiAgICAgICAgICAgIHRoaXMubWF0Y2hlZCA9IHRoaXMuc3dpdGNoZWQgPSB0aGlzLl9wYXR0ZXJuID0gdGhpcy5fbWF0Y2hSZWdleHAgPSBudWxsO1xuICAgICAgICB9LFxuXG4gICAgICAgIHRvU3RyaW5nIDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgcmV0dXJuICdbUm91dGUgcGF0dGVybjpcIicrIHRoaXMuX3BhdHRlcm4gKydcIiwgbnVtTGlzdGVuZXJzOicrIHRoaXMubWF0Y2hlZC5nZXROdW1MaXN0ZW5lcnMoKSArJ10nO1xuICAgICAgICB9XG5cbiAgICB9O1xuXG5cblxuICAgIC8vIFBhdHRlcm4gTGV4ZXIgLS0tLS0tXG4gICAgLy89PT09PT09PT09PT09PT09PT09PT1cblxuICAgIENyb3Nzcm9hZHMucHJvdG90eXBlLnBhdHRlcm5MZXhlciA9IChmdW5jdGlvbiAoKSB7XG5cbiAgICAgICAgdmFyXG4gICAgICAgICAgICAvL21hdGNoIGNoYXJzIHRoYXQgc2hvdWxkIGJlIGVzY2FwZWQgb24gc3RyaW5nIHJlZ2V4cFxuICAgICAgICAgICAgRVNDQVBFX0NIQVJTX1JFR0VYUCA9IC9bXFxcXC4rKj9cXF4kXFxbXFxdKCl7fVxcLycjXS9nLFxuXG4gICAgICAgICAgICAvL3RyYWlsaW5nIHNsYXNoZXMgKGJlZ2luL2VuZCBvZiBzdHJpbmcpXG4gICAgICAgICAgICBMT09TRV9TTEFTSEVTX1JFR0VYUCA9IC9eXFwvfFxcLyQvZyxcbiAgICAgICAgICAgIExFR0FDWV9TTEFTSEVTX1JFR0VYUCA9IC9cXC8kL2csXG5cbiAgICAgICAgICAgIC8vcGFyYW1zIC0gZXZlcnl0aGluZyBiZXR3ZWVuIGB7IH1gIG9yIGA6IDpgXG4gICAgICAgICAgICBQQVJBTVNfUkVHRVhQID0gLyg/Olxce3w6KShbXn06XSspKD86XFx9fDopL2csXG5cbiAgICAgICAgICAgIC8vdXNlZCB0byBzYXZlIHBhcmFtcyBkdXJpbmcgY29tcGlsZSAoYXZvaWQgZXNjYXBpbmcgdGhpbmdzIHRoYXRcbiAgICAgICAgICAgIC8vc2hvdWxkbid0IGJlIGVzY2FwZWQpLlxuICAgICAgICAgICAgVE9LRU5TID0ge1xuICAgICAgICAgICAgICAgICdPUycgOiB7XG4gICAgICAgICAgICAgICAgICAgIC8vb3B0aW9uYWwgc2xhc2hlc1xuICAgICAgICAgICAgICAgICAgICAvL3NsYXNoIGJldHdlZW4gYDo6YCBvciBgfTpgIG9yIGBcXHc6YCBvciBgOns/YCBvciBgfXs/YCBvciBgXFx3ez9gXG4gICAgICAgICAgICAgICAgICAgIHJneCA6IC8oWzp9XXxcXHcoPz1cXC8pKVxcLz8oOnwoPzpcXHtcXD8pKS9nLFxuICAgICAgICAgICAgICAgICAgICBzYXZlIDogJyQxe3tpZH19JDInLFxuICAgICAgICAgICAgICAgICAgICByZXMgOiAnXFxcXC8/J1xuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgJ1JTJyA6IHtcbiAgICAgICAgICAgICAgICAgICAgLy9yZXF1aXJlZCBzbGFzaGVzXG4gICAgICAgICAgICAgICAgICAgIC8vdXNlZCB0byBpbnNlcnQgc2xhc2ggYmV0d2VlbiBgOntgIGFuZCBgfXtgXG4gICAgICAgICAgICAgICAgICAgIHJneCA6IC8oWzp9XSlcXC8/KFxceykvZyxcbiAgICAgICAgICAgICAgICAgICAgc2F2ZSA6ICckMXt7aWR9fSQyJyxcbiAgICAgICAgICAgICAgICAgICAgcmVzIDogJ1xcXFwvJ1xuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgJ1JRJyA6IHtcbiAgICAgICAgICAgICAgICAgICAgLy9yZXF1aXJlZCBxdWVyeSBzdHJpbmcgLSBldmVyeXRoaW5nIGluIGJldHdlZW4gYHs/IH1gXG4gICAgICAgICAgICAgICAgICAgIHJneCA6IC9cXHtcXD8oW159XSspXFx9L2csXG4gICAgICAgICAgICAgICAgICAgIC8vZXZlcnl0aGluZyBmcm9tIGA/YCB0aWxsIGAjYCBvciBlbmQgb2Ygc3RyaW5nXG4gICAgICAgICAgICAgICAgICAgIHJlcyA6ICdcXFxcPyhbXiNdKyknXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAnT1EnIDoge1xuICAgICAgICAgICAgICAgICAgICAvL29wdGlvbmFsIHF1ZXJ5IHN0cmluZyAtIGV2ZXJ5dGhpbmcgaW4gYmV0d2VlbiBgOj8gOmBcbiAgICAgICAgICAgICAgICAgICAgcmd4IDogLzpcXD8oW146XSspOi9nLFxuICAgICAgICAgICAgICAgICAgICAvL2V2ZXJ5dGhpbmcgZnJvbSBgP2AgdGlsbCBgI2Agb3IgZW5kIG9mIHN0cmluZ1xuICAgICAgICAgICAgICAgICAgICByZXMgOiAnKD86XFxcXD8oW14jXSopKT8nXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAnT1InIDoge1xuICAgICAgICAgICAgICAgICAgICAvL29wdGlvbmFsIHJlc3QgLSBldmVyeXRoaW5nIGluIGJldHdlZW4gYDogKjpgXG4gICAgICAgICAgICAgICAgICAgIHJneCA6IC86KFteOl0rKVxcKjovZyxcbiAgICAgICAgICAgICAgICAgICAgcmVzIDogJyguKik/JyAvLyBvcHRpb25hbCBncm91cCB0byBhdm9pZCBwYXNzaW5nIGVtcHR5IHN0cmluZyBhcyBjYXB0dXJlZFxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgJ1JSJyA6IHtcbiAgICAgICAgICAgICAgICAgICAgLy9yZXN0IHBhcmFtIC0gZXZlcnl0aGluZyBpbiBiZXR3ZWVuIGB7ICp9YFxuICAgICAgICAgICAgICAgICAgICByZ3ggOiAvXFx7KFtefV0rKVxcKlxcfS9nLFxuICAgICAgICAgICAgICAgICAgICByZXMgOiAnKC4rKSdcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIC8vIHJlcXVpcmVkL29wdGlvbmFsIHBhcmFtcyBzaG91bGQgY29tZSBhZnRlciByZXN0IHNlZ21lbnRzXG4gICAgICAgICAgICAgICAgJ1JQJyA6IHtcbiAgICAgICAgICAgICAgICAgICAgLy9yZXF1aXJlZCBwYXJhbXMgLSBldmVyeXRoaW5nIGJldHdlZW4gYHsgfWBcbiAgICAgICAgICAgICAgICAgICAgcmd4IDogL1xceyhbXn1dKylcXH0vZyxcbiAgICAgICAgICAgICAgICAgICAgcmVzIDogJyhbXlxcXFwvP10rKSdcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICdPUCcgOiB7XG4gICAgICAgICAgICAgICAgICAgIC8vb3B0aW9uYWwgcGFyYW1zIC0gZXZlcnl0aGluZyBiZXR3ZWVuIGA6IDpgXG4gICAgICAgICAgICAgICAgICAgIHJneCA6IC86KFteOl0rKTovZyxcbiAgICAgICAgICAgICAgICAgICAgcmVzIDogJyhbXlxcXFwvP10rKT9cXC8/J1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0sXG5cbiAgICAgICAgICAgIExPT1NFX1NMQVNIID0gMSxcbiAgICAgICAgICAgIFNUUklDVF9TTEFTSCA9IDIsXG4gICAgICAgICAgICBMRUdBQ1lfU0xBU0ggPSAzLFxuXG4gICAgICAgICAgICBfc2xhc2hNb2RlID0gTE9PU0VfU0xBU0g7XG5cblxuICAgICAgICBmdW5jdGlvbiBwcmVjb21waWxlVG9rZW5zKCl7XG4gICAgICAgICAgICB2YXIga2V5LCBjdXI7XG4gICAgICAgICAgICBmb3IgKGtleSBpbiBUT0tFTlMpIHtcbiAgICAgICAgICAgICAgICBpZiAoVE9LRU5TLmhhc093blByb3BlcnR5KGtleSkpIHtcbiAgICAgICAgICAgICAgICAgICAgY3VyID0gVE9LRU5TW2tleV07XG4gICAgICAgICAgICAgICAgICAgIGN1ci5pZCA9ICdfX0NSXycrIGtleSArJ19fJztcbiAgICAgICAgICAgICAgICAgICAgY3VyLnNhdmUgPSAoJ3NhdmUnIGluIGN1cik/IGN1ci5zYXZlLnJlcGxhY2UoJ3t7aWR9fScsIGN1ci5pZCkgOiBjdXIuaWQ7XG4gICAgICAgICAgICAgICAgICAgIGN1ci5yUmVzdG9yZSA9IG5ldyBSZWdFeHAoY3VyLmlkLCAnZycpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBwcmVjb21waWxlVG9rZW5zKCk7XG5cblxuICAgICAgICBmdW5jdGlvbiBjYXB0dXJlVmFscyhyZWdleCwgcGF0dGVybikge1xuICAgICAgICAgICAgdmFyIHZhbHMgPSBbXSwgbWF0Y2g7XG4gICAgICAgICAgICAvLyB2ZXJ5IGltcG9ydGFudCB0byByZXNldCBsYXN0SW5kZXggc2luY2UgUmVnRXhwIGNhbiBoYXZlIFwiZ1wiIGZsYWdcbiAgICAgICAgICAgIC8vIGFuZCBtdWx0aXBsZSBydW5zIG1pZ2h0IGFmZmVjdCB0aGUgcmVzdWx0LCBzcGVjaWFsbHkgaWYgbWF0Y2hpbmdcbiAgICAgICAgICAgIC8vIHNhbWUgc3RyaW5nIG11bHRpcGxlIHRpbWVzIG9uIElFIDctOFxuICAgICAgICAgICAgcmVnZXgubGFzdEluZGV4ID0gMDtcbiAgICAgICAgICAgIHdoaWxlIChtYXRjaCA9IHJlZ2V4LmV4ZWMocGF0dGVybikpIHtcbiAgICAgICAgICAgICAgICB2YWxzLnB1c2gobWF0Y2hbMV0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHZhbHM7XG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiBnZXRQYXJhbUlkcyhwYXR0ZXJuKSB7XG4gICAgICAgICAgICByZXR1cm4gY2FwdHVyZVZhbHMoUEFSQU1TX1JFR0VYUCwgcGF0dGVybik7XG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiBnZXRPcHRpb25hbFBhcmFtc0lkcyhwYXR0ZXJuKSB7XG4gICAgICAgICAgICByZXR1cm4gY2FwdHVyZVZhbHMoVE9LRU5TLk9QLnJneCwgcGF0dGVybik7XG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiBjb21waWxlUGF0dGVybihwYXR0ZXJuLCBpZ25vcmVDYXNlKSB7XG4gICAgICAgICAgICBwYXR0ZXJuID0gcGF0dGVybiB8fCAnJztcblxuICAgICAgICAgICAgaWYocGF0dGVybil7XG4gICAgICAgICAgICAgICAgaWYgKF9zbGFzaE1vZGUgPT09IExPT1NFX1NMQVNIKSB7XG4gICAgICAgICAgICAgICAgICAgIHBhdHRlcm4gPSBwYXR0ZXJuLnJlcGxhY2UoTE9PU0VfU0xBU0hFU19SRUdFWFAsICcnKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZWxzZSBpZiAoX3NsYXNoTW9kZSA9PT0gTEVHQUNZX1NMQVNIKSB7XG4gICAgICAgICAgICAgICAgICAgIHBhdHRlcm4gPSBwYXR0ZXJuLnJlcGxhY2UoTEVHQUNZX1NMQVNIRVNfUkVHRVhQLCAnJyk7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgLy9zYXZlIHRva2Vuc1xuICAgICAgICAgICAgICAgIHBhdHRlcm4gPSByZXBsYWNlVG9rZW5zKHBhdHRlcm4sICdyZ3gnLCAnc2F2ZScpO1xuICAgICAgICAgICAgICAgIC8vcmVnZXhwIGVzY2FwZVxuICAgICAgICAgICAgICAgIHBhdHRlcm4gPSBwYXR0ZXJuLnJlcGxhY2UoRVNDQVBFX0NIQVJTX1JFR0VYUCwgJ1xcXFwkJicpO1xuICAgICAgICAgICAgICAgIC8vcmVzdG9yZSB0b2tlbnNcbiAgICAgICAgICAgICAgICBwYXR0ZXJuID0gcmVwbGFjZVRva2VucyhwYXR0ZXJuLCAnclJlc3RvcmUnLCAncmVzJyk7XG5cbiAgICAgICAgICAgICAgICBpZiAoX3NsYXNoTW9kZSA9PT0gTE9PU0VfU0xBU0gpIHtcbiAgICAgICAgICAgICAgICAgICAgcGF0dGVybiA9ICdcXFxcLz8nKyBwYXR0ZXJuO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKF9zbGFzaE1vZGUgIT09IFNUUklDVF9TTEFTSCkge1xuICAgICAgICAgICAgICAgIC8vc2luZ2xlIHNsYXNoIGlzIHRyZWF0ZWQgYXMgZW1wdHkgYW5kIGVuZCBzbGFzaCBpcyBvcHRpb25hbFxuICAgICAgICAgICAgICAgIHBhdHRlcm4gKz0gJ1xcXFwvPyc7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gbmV3IFJlZ0V4cCgnXicrIHBhdHRlcm4gKyAnJCcsIGlnbm9yZUNhc2U/ICdpJyA6ICcnKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIHJlcGxhY2VUb2tlbnMocGF0dGVybiwgcmVnZXhwTmFtZSwgcmVwbGFjZU5hbWUpIHtcbiAgICAgICAgICAgIHZhciBjdXIsIGtleTtcbiAgICAgICAgICAgIGZvciAoa2V5IGluIFRPS0VOUykge1xuICAgICAgICAgICAgICAgIGlmIChUT0tFTlMuaGFzT3duUHJvcGVydHkoa2V5KSkge1xuICAgICAgICAgICAgICAgICAgICBjdXIgPSBUT0tFTlNba2V5XTtcbiAgICAgICAgICAgICAgICAgICAgcGF0dGVybiA9IHBhdHRlcm4ucmVwbGFjZShjdXJbcmVnZXhwTmFtZV0sIGN1cltyZXBsYWNlTmFtZV0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBwYXR0ZXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgZnVuY3Rpb24gZ2V0UGFyYW1WYWx1ZXMocmVxdWVzdCwgcmVnZXhwLCBzaG91bGRUeXBlY2FzdCkge1xuICAgICAgICAgICAgdmFyIHZhbHMgPSByZWdleHAuZXhlYyhyZXF1ZXN0KTtcbiAgICAgICAgICAgIGlmICh2YWxzKSB7XG4gICAgICAgICAgICAgICAgdmFscy5zaGlmdCgpO1xuICAgICAgICAgICAgICAgIGlmIChzaG91bGRUeXBlY2FzdCkge1xuICAgICAgICAgICAgICAgICAgICB2YWxzID0gdHlwZWNhc3RBcnJheVZhbHVlcyh2YWxzKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gdmFscztcbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIGludGVycG9sYXRlKHBhdHRlcm4sIHJlcGxhY2VtZW50cykge1xuICAgICAgICAgICAgLy8gZGVmYXVsdCB0byBhbiBlbXB0eSBvYmplY3QgYmVjYXVzZSBwYXR0ZXJuIG1pZ2h0IGhhdmUganVzdFxuICAgICAgICAgICAgLy8gb3B0aW9uYWwgYXJndW1lbnRzXG4gICAgICAgICAgICByZXBsYWNlbWVudHMgPSByZXBsYWNlbWVudHMgfHwge307XG4gICAgICAgICAgICBpZiAodHlwZW9mIHBhdHRlcm4gIT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdSb3V0ZSBwYXR0ZXJuIHNob3VsZCBiZSBhIHN0cmluZy4nKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdmFyIHJlcGxhY2VGbiA9IGZ1bmN0aW9uKG1hdGNoLCBwcm9wKXtcbiAgICAgICAgICAgICAgICAgICAgdmFyIHZhbDtcbiAgICAgICAgICAgICAgICAgICAgcHJvcCA9IChwcm9wLnN1YnN0cigwLCAxKSA9PT0gJz8nKT8gcHJvcC5zdWJzdHIoMSkgOiBwcm9wO1xuICAgICAgICAgICAgICAgICAgICBpZiAocmVwbGFjZW1lbnRzW3Byb3BdICE9IG51bGwpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgcmVwbGFjZW1lbnRzW3Byb3BdID09PSAnb2JqZWN0Jykge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZhciBxdWVyeVBhcnRzID0gW10sIHJlcDtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBmb3IodmFyIGtleSBpbiByZXBsYWNlbWVudHNbcHJvcF0pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVwID0gcmVwbGFjZW1lbnRzW3Byb3BdW2tleV07XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChpc0FycmF5KHJlcCkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGZvciAodmFyIGsgaW4gcmVwKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCBrZXkuc2xpY2UoLTIpID09ICdbXScgKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHF1ZXJ5UGFydHMucHVzaChlbmNvZGVVUkkoa2V5LnNsaWNlKDAsIC0yKSkgKyAnW109JyArIGVuY29kZVVSSShyZXBba10pKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBxdWVyeVBhcnRzLnB1c2goZW5jb2RlVVJJKGtleSArICc9JyArIHJlcFtrXSkpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHF1ZXJ5UGFydHMucHVzaChlbmNvZGVVUkkoa2V5ICsgJz0nICsgcmVwKSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdmFsID0gJz8nICsgcXVlcnlQYXJ0cy5qb2luKCcmJyk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIG1ha2Ugc3VyZSB2YWx1ZSBpcyBhIHN0cmluZyBzZWUgI2doLTU0XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdmFsID0gU3RyaW5nKHJlcGxhY2VtZW50c1twcm9wXSk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChtYXRjaC5pbmRleE9mKCcqJykgPT09IC0xICYmIHZhbC5pbmRleE9mKCcvJykgIT09IC0xKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIHZhbHVlIFwiJysgdmFsICsnXCIgZm9yIHNlZ21lbnQgXCInKyBtYXRjaCArJ1wiLicpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGVsc2UgaWYgKG1hdGNoLmluZGV4T2YoJ3snKSAhPT0gLTEpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignVGhlIHNlZ21lbnQgJysgbWF0Y2ggKycgaXMgcmVxdWlyZWQuJyk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB2YWwgPSAnJztcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gdmFsO1xuICAgICAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgIGlmICghIFRPS0VOUy5PUy50cmFpbCkge1xuICAgICAgICAgICAgICAgIFRPS0VOUy5PUy50cmFpbCA9IG5ldyBSZWdFeHAoJyg/OicrIFRPS0VOUy5PUy5pZCArJykrJCcpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4gcGF0dGVyblxuICAgICAgICAgICAgICAgICAgICAgICAgLnJlcGxhY2UoVE9LRU5TLk9TLnJneCwgVE9LRU5TLk9TLnNhdmUpXG4gICAgICAgICAgICAgICAgICAgICAgICAucmVwbGFjZShQQVJBTVNfUkVHRVhQLCByZXBsYWNlRm4pXG4gICAgICAgICAgICAgICAgICAgICAgICAucmVwbGFjZShUT0tFTlMuT1MudHJhaWwsICcnKSAvLyByZW1vdmUgdHJhaWxpbmdcbiAgICAgICAgICAgICAgICAgICAgICAgIC5yZXBsYWNlKFRPS0VOUy5PUy5yUmVzdG9yZSwgJy8nKTsgLy8gYWRkIHNsYXNoIGJldHdlZW4gc2VnbWVudHNcbiAgICAgICAgfVxuXG4gICAgICAgIC8vQVBJXG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBzdHJpY3QgOiBmdW5jdGlvbigpe1xuICAgICAgICAgICAgICAgIF9zbGFzaE1vZGUgPSBTVFJJQ1RfU0xBU0g7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgbG9vc2UgOiBmdW5jdGlvbigpe1xuICAgICAgICAgICAgICAgIF9zbGFzaE1vZGUgPSBMT09TRV9TTEFTSDtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBsZWdhY3kgOiBmdW5jdGlvbigpe1xuICAgICAgICAgICAgICAgIF9zbGFzaE1vZGUgPSBMRUdBQ1lfU0xBU0g7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgZ2V0UGFyYW1JZHMgOiBnZXRQYXJhbUlkcyxcbiAgICAgICAgICAgIGdldE9wdGlvbmFsUGFyYW1zSWRzIDogZ2V0T3B0aW9uYWxQYXJhbXNJZHMsXG4gICAgICAgICAgICBnZXRQYXJhbVZhbHVlcyA6IGdldFBhcmFtVmFsdWVzLFxuICAgICAgICAgICAgY29tcGlsZVBhdHRlcm4gOiBjb21waWxlUGF0dGVybixcbiAgICAgICAgICAgIGludGVycG9sYXRlIDogaW50ZXJwb2xhdGVcbiAgICAgICAgfTtcblxuICAgIH0oKSk7XG5cblxuICAgIHJldHVybiBjcm9zc3JvYWRzO1xufTtcblxuaWYgKHR5cGVvZiBkZWZpbmUgPT09ICdmdW5jdGlvbicgJiYgZGVmaW5lLmFtZCkge1xuICAgIGRlZmluZShbJ3NpZ25hbHMnXSwgZmFjdG9yeSk7XG59IGVsc2UgaWYgKHR5cGVvZiBtb2R1bGUgIT09ICd1bmRlZmluZWQnICYmIG1vZHVsZS5leHBvcnRzKSB7IC8vTm9kZVxuICAgIG1vZHVsZS5leHBvcnRzID0gZmFjdG9yeShyZXF1aXJlKCdzaWduYWxzJykpO1xufSBlbHNlIHtcbiAgICAvKmpzaGludCBzdWI6dHJ1ZSAqL1xuICAgIHdpbmRvd1snY3Jvc3Nyb2FkcyddID0gZmFjdG9yeSh3aW5kb3dbJ3NpZ25hbHMnXSk7XG59XG5cbn0oKSk7XG5cbiIsIi8qISFcbiAqIEhhc2hlciA8aHR0cDovL2dpdGh1Yi5jb20vbWlsbGVybWVkZWlyb3MvaGFzaGVyPlxuICogQGF1dGhvciBNaWxsZXIgTWVkZWlyb3NcbiAqIEB2ZXJzaW9uIDEuMi4wICgyMDEzLzExLzExIDAzOjE4IFBNKVxuICogUmVsZWFzZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlXG4gKi9cblxuOyhmdW5jdGlvbiAoKSB7XG52YXIgZmFjdG9yeSA9IGZ1bmN0aW9uKHNpZ25hbHMpe1xuXG4vKmpzaGludCB3aGl0ZTpmYWxzZSovXG4vKmdsb2JhbCBzaWduYWxzOmZhbHNlLCB3aW5kb3c6ZmFsc2UqL1xuXG4vKipcbiAqIEhhc2hlclxuICogQG5hbWVzcGFjZSBIaXN0b3J5IE1hbmFnZXIgZm9yIHJpY2gtbWVkaWEgYXBwbGljYXRpb25zLlxuICogQG5hbWUgaGFzaGVyXG4gKi9cbnZhciBoYXNoZXIgPSAoZnVuY3Rpb24od2luZG93KXtcblxuICAgIC8vLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICAvLyBQcml2YXRlIFZhcnNcbiAgICAvLy0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbiAgICB2YXJcblxuICAgICAgICAvLyBmcmVxdWVuY3kgdGhhdCBpdCB3aWxsIGNoZWNrIGhhc2ggdmFsdWUgb24gSUUgNi03IHNpbmNlIGl0IGRvZXNuJ3RcbiAgICAgICAgLy8gc3VwcG9ydCB0aGUgaGFzaGNoYW5nZSBldmVudFxuICAgICAgICBQT09MX0lOVEVSVkFMID0gMjUsXG5cbiAgICAgICAgLy8gbG9jYWwgc3RvcmFnZSBmb3IgYnJldml0eSBhbmQgYmV0dGVyIGNvbXByZXNzaW9uIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbiAgICAgICAgZG9jdW1lbnQgPSB3aW5kb3cuZG9jdW1lbnQsXG4gICAgICAgIGhpc3RvcnkgPSB3aW5kb3cuaGlzdG9yeSxcbiAgICAgICAgU2lnbmFsID0gc2lnbmFscy5TaWduYWwsXG5cbiAgICAgICAgLy8gbG9jYWwgdmFycyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbiAgICAgICAgaGFzaGVyLFxuICAgICAgICBfaGFzaCxcbiAgICAgICAgX2NoZWNrSW50ZXJ2YWwsXG4gICAgICAgIF9pc0FjdGl2ZSxcbiAgICAgICAgX2ZyYW1lLCAvL2lmcmFtZSB1c2VkIGZvciBsZWdhY3kgSUUgKDYtNylcbiAgICAgICAgX2NoZWNrSGlzdG9yeSxcbiAgICAgICAgX2hhc2hWYWxSZWdleHAgPSAvIyguKikkLyxcbiAgICAgICAgX2Jhc2VVcmxSZWdleHAgPSAvKFxcPy4qKXwoXFwjLiopLyxcbiAgICAgICAgX2hhc2hSZWdleHAgPSAvXlxcIy8sXG5cbiAgICAgICAgLy8gc25pZmZpbmcvZmVhdHVyZSBkZXRlY3Rpb24gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG4gICAgICAgIC8vaGFjayBiYXNlZCBvbiB0aGlzOiBodHRwOi8vd2VicmVmbGVjdGlvbi5ibG9nc3BvdC5jb20vMjAwOS8wMS8zMi1ieXRlcy10by1rbm93LWlmLXlvdXItYnJvd3Nlci1pcy1pZS5odG1sXG4gICAgICAgIF9pc0lFID0gKCErXCJcXHYxXCIpLFxuICAgICAgICAvLyBoYXNoY2hhbmdlIGlzIHN1cHBvcnRlZCBieSBGRjMuNissIElFOCssIENocm9tZSA1KywgU2FmYXJpIDUrIGJ1dFxuICAgICAgICAvLyBmZWF0dXJlIGRldGVjdGlvbiBmYWlscyBvbiBJRSBjb21wYXRpYmlsaXR5IG1vZGUsIHNvIHdlIG5lZWQgdG9cbiAgICAgICAgLy8gY2hlY2sgZG9jdW1lbnRNb2RlXG4gICAgICAgIF9pc0hhc2hDaGFuZ2VTdXBwb3J0ZWQgPSAoJ29uaGFzaGNoYW5nZScgaW4gd2luZG93KSAmJiBkb2N1bWVudC5kb2N1bWVudE1vZGUgIT09IDcsXG4gICAgICAgIC8vY2hlY2sgaWYgaXMgSUU2LTcgc2luY2UgaGFzaCBjaGFuZ2UgaXMgb25seSBzdXBwb3J0ZWQgb24gSUU4KyBhbmRcbiAgICAgICAgLy9jaGFuZ2luZyBoYXNoIHZhbHVlIG9uIElFNi03IGRvZXNuJ3QgZ2VuZXJhdGUgaGlzdG9yeSByZWNvcmQuXG4gICAgICAgIF9pc0xlZ2FjeUlFID0gX2lzSUUgJiYgIV9pc0hhc2hDaGFuZ2VTdXBwb3J0ZWQsXG4gICAgICAgIF9pc0xvY2FsID0gKGxvY2F0aW9uLnByb3RvY29sID09PSAnZmlsZTonKTtcblxuXG4gICAgLy8tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIC8vIFByaXZhdGUgTWV0aG9kc1xuICAgIC8vLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuICAgIGZ1bmN0aW9uIF9lc2NhcGVSZWdFeHAoc3RyKXtcbiAgICAgICAgcmV0dXJuIFN0cmluZyhzdHIgfHwgJycpLnJlcGxhY2UoL1xcVy9nLCBcIlxcXFwkJlwiKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBfdHJpbUhhc2goaGFzaCl7XG4gICAgICAgIGlmICghaGFzaCkgcmV0dXJuICcnO1xuICAgICAgICB2YXIgcmVnZXhwID0gbmV3IFJlZ0V4cCgnXicgKyBfZXNjYXBlUmVnRXhwKGhhc2hlci5wcmVwZW5kSGFzaCkgKyAnfCcgKyBfZXNjYXBlUmVnRXhwKGhhc2hlci5hcHBlbmRIYXNoKSArICckJywgJ2cnKTtcbiAgICAgICAgcmV0dXJuIGhhc2gucmVwbGFjZShyZWdleHAsICcnKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBfZ2V0V2luZG93SGFzaCgpe1xuICAgICAgICAvL3BhcnNlZCBmdWxsIFVSTCBpbnN0ZWFkIG9mIGdldHRpbmcgd2luZG93LmxvY2F0aW9uLmhhc2ggYmVjYXVzZSBGaXJlZm94IGRlY29kZSBoYXNoIHZhbHVlIChhbmQgYWxsIHRoZSBvdGhlciBicm93c2VycyBkb24ndClcbiAgICAgICAgLy9hbHNvIGJlY2F1c2Ugb2YgSUU4IGJ1ZyB3aXRoIGhhc2ggcXVlcnkgaW4gbG9jYWwgZmlsZSBbaXNzdWUgIzZdXG4gICAgICAgIHZhciByZXN1bHQgPSBfaGFzaFZhbFJlZ2V4cC5leGVjKCBoYXNoZXIuZ2V0VVJMKCkgKTtcbiAgICAgICAgdmFyIHBhdGggPSAocmVzdWx0ICYmIHJlc3VsdFsxXSkgfHwgJyc7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgcmV0dXJuIGhhc2hlci5yYXc/IHBhdGggOiBkZWNvZGVVUklDb21wb25lbnQocGF0aCk7XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAvLyBpbiBjYXNlIHVzZXIgZGlkIG5vdCBzZXQgYGhhc2hlci5yYXdgIGFuZCBkZWNvZGVVUklDb21wb25lbnRcbiAgICAgICAgICAvLyB0aHJvd3MgYW4gZXJyb3IgKHNlZSAjNTcpXG4gICAgICAgICAgcmV0dXJuIHBhdGg7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiBfZ2V0RnJhbWVIYXNoKCl7XG4gICAgICAgIHJldHVybiAoX2ZyYW1lKT8gX2ZyYW1lLmNvbnRlbnRXaW5kb3cuZnJhbWVIYXNoIDogbnVsbDtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBfY3JlYXRlRnJhbWUoKXtcbiAgICAgICAgX2ZyYW1lID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnaWZyYW1lJyk7XG4gICAgICAgIF9mcmFtZS5zcmMgPSAnYWJvdXQ6YmxhbmsnO1xuICAgICAgICBfZnJhbWUuc3R5bGUuZGlzcGxheSA9ICdub25lJztcbiAgICAgICAgZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChfZnJhbWUpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIF91cGRhdGVGcmFtZSgpe1xuICAgICAgICBpZihfZnJhbWUgJiYgX2hhc2ggIT09IF9nZXRGcmFtZUhhc2goKSl7XG4gICAgICAgICAgICB2YXIgZnJhbWVEb2MgPSBfZnJhbWUuY29udGVudFdpbmRvdy5kb2N1bWVudDtcbiAgICAgICAgICAgIGZyYW1lRG9jLm9wZW4oKTtcbiAgICAgICAgICAgIC8vdXBkYXRlIGlmcmFtZSBjb250ZW50IHRvIGZvcmNlIG5ldyBoaXN0b3J5IHJlY29yZC5cbiAgICAgICAgICAgIC8vYmFzZWQgb24gUmVhbGx5IFNpbXBsZSBIaXN0b3J5LCBTV0ZBZGRyZXNzIGFuZCBZVUkuaGlzdG9yeS5cbiAgICAgICAgICAgIGZyYW1lRG9jLndyaXRlKCc8aHRtbD48aGVhZD48dGl0bGU+JyArIGRvY3VtZW50LnRpdGxlICsgJzwvdGl0bGU+PHNjcmlwdCB0eXBlPVwidGV4dC9qYXZhc2NyaXB0XCI+dmFyIGZyYW1lSGFzaD1cIicgKyBfaGFzaCArICdcIjs8L3NjcmlwdD48L2hlYWQ+PGJvZHk+Jm5ic3A7PC9ib2R5PjwvaHRtbD4nKTtcbiAgICAgICAgICAgIGZyYW1lRG9jLmNsb3NlKCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiBfcmVnaXN0ZXJDaGFuZ2UobmV3SGFzaCwgaXNSZXBsYWNlKXtcbiAgICAgICAgaWYoX2hhc2ggIT09IG5ld0hhc2gpe1xuICAgICAgICAgICAgdmFyIG9sZEhhc2ggPSBfaGFzaDtcbiAgICAgICAgICAgIF9oYXNoID0gbmV3SGFzaDsgLy9zaG91bGQgY29tZSBiZWZvcmUgZXZlbnQgZGlzcGF0Y2ggdG8gbWFrZSBzdXJlIHVzZXIgY2FuIGdldCBwcm9wZXIgdmFsdWUgaW5zaWRlIGV2ZW50IGhhbmRsZXJcbiAgICAgICAgICAgIGlmKF9pc0xlZ2FjeUlFKXtcbiAgICAgICAgICAgICAgICBpZighaXNSZXBsYWNlKXtcbiAgICAgICAgICAgICAgICAgICAgX3VwZGF0ZUZyYW1lKCk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgX2ZyYW1lLmNvbnRlbnRXaW5kb3cuZnJhbWVIYXNoID0gbmV3SGFzaDtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBoYXNoZXIuY2hhbmdlZC5kaXNwYXRjaChfdHJpbUhhc2gobmV3SGFzaCksIF90cmltSGFzaChvbGRIYXNoKSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAoX2lzTGVnYWN5SUUpIHtcbiAgICAgICAgLyoqXG4gICAgICAgICAqIEBwcml2YXRlXG4gICAgICAgICAqL1xuICAgICAgICBfY2hlY2tIaXN0b3J5ID0gZnVuY3Rpb24oKXtcbiAgICAgICAgICAgIHZhciB3aW5kb3dIYXNoID0gX2dldFdpbmRvd0hhc2goKSxcbiAgICAgICAgICAgICAgICBmcmFtZUhhc2ggPSBfZ2V0RnJhbWVIYXNoKCk7XG4gICAgICAgICAgICBpZihmcmFtZUhhc2ggIT09IF9oYXNoICYmIGZyYW1lSGFzaCAhPT0gd2luZG93SGFzaCl7XG4gICAgICAgICAgICAgICAgLy9kZXRlY3QgY2hhbmdlcyBtYWRlIHByZXNzaW5nIGJyb3dzZXIgaGlzdG9yeSBidXR0b25zLlxuICAgICAgICAgICAgICAgIC8vV29ya2Fyb3VuZCBzaW5jZSBoaXN0b3J5LmJhY2soKSBhbmQgaGlzdG9yeS5mb3J3YXJkKCkgZG9lc24ndFxuICAgICAgICAgICAgICAgIC8vdXBkYXRlIGhhc2ggdmFsdWUgb24gSUU2LzcgYnV0IHVwZGF0ZXMgY29udGVudCBvZiB0aGUgaWZyYW1lLlxuICAgICAgICAgICAgICAgIC8vbmVlZHMgdG8gdHJpbSBoYXNoIHNpbmNlIHZhbHVlIHN0b3JlZCBhbHJlYWR5IGhhdmVcbiAgICAgICAgICAgICAgICAvL3ByZXBlbmRIYXNoICsgYXBwZW5kSGFzaCBmb3IgZmFzdCBjaGVjay5cbiAgICAgICAgICAgICAgICBoYXNoZXIuc2V0SGFzaChfdHJpbUhhc2goZnJhbWVIYXNoKSk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHdpbmRvd0hhc2ggIT09IF9oYXNoKXtcbiAgICAgICAgICAgICAgICAvL2RldGVjdCBpZiBoYXNoIGNoYW5nZWQgKG1hbnVhbGx5IG9yIHVzaW5nIHNldEhhc2gpXG4gICAgICAgICAgICAgICAgX3JlZ2lzdGVyQ2hhbmdlKHdpbmRvd0hhc2gpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuICAgIH0gZWxzZSB7XG4gICAgICAgIC8qKlxuICAgICAgICAgKiBAcHJpdmF0ZVxuICAgICAgICAgKi9cbiAgICAgICAgX2NoZWNrSGlzdG9yeSA9IGZ1bmN0aW9uKCl7XG4gICAgICAgICAgICB2YXIgd2luZG93SGFzaCA9IF9nZXRXaW5kb3dIYXNoKCk7XG4gICAgICAgICAgICBpZih3aW5kb3dIYXNoICE9PSBfaGFzaCl7XG4gICAgICAgICAgICAgICAgX3JlZ2lzdGVyQ2hhbmdlKHdpbmRvd0hhc2gpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIF9hZGRMaXN0ZW5lcihlbG0sIGVUeXBlLCBmbil7XG4gICAgICAgIGlmKGVsbS5hZGRFdmVudExpc3RlbmVyKXtcbiAgICAgICAgICAgIGVsbS5hZGRFdmVudExpc3RlbmVyKGVUeXBlLCBmbiwgZmFsc2UpO1xuICAgICAgICB9IGVsc2UgaWYgKGVsbS5hdHRhY2hFdmVudCl7XG4gICAgICAgICAgICBlbG0uYXR0YWNoRXZlbnQoJ29uJyArIGVUeXBlLCBmbik7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiBfcmVtb3ZlTGlzdGVuZXIoZWxtLCBlVHlwZSwgZm4pe1xuICAgICAgICBpZihlbG0ucmVtb3ZlRXZlbnRMaXN0ZW5lcil7XG4gICAgICAgICAgICBlbG0ucmVtb3ZlRXZlbnRMaXN0ZW5lcihlVHlwZSwgZm4sIGZhbHNlKTtcbiAgICAgICAgfSBlbHNlIGlmIChlbG0uZGV0YWNoRXZlbnQpe1xuICAgICAgICAgICAgZWxtLmRldGFjaEV2ZW50KCdvbicgKyBlVHlwZSwgZm4pO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gX21ha2VQYXRoKHBhdGhzKXtcbiAgICAgICAgcGF0aHMgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMpO1xuXG4gICAgICAgIHZhciBwYXRoID0gcGF0aHMuam9pbihoYXNoZXIuc2VwYXJhdG9yKTtcbiAgICAgICAgcGF0aCA9IHBhdGg/IGhhc2hlci5wcmVwZW5kSGFzaCArIHBhdGgucmVwbGFjZShfaGFzaFJlZ2V4cCwgJycpICsgaGFzaGVyLmFwcGVuZEhhc2ggOiBwYXRoO1xuICAgICAgICByZXR1cm4gcGF0aDtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBfZW5jb2RlUGF0aChwYXRoKXtcbiAgICAgICAgLy91c2VkIGVuY29kZVVSSSBpbnN0ZWFkIG9mIGVuY29kZVVSSUNvbXBvbmVudCB0byBwcmVzZXJ2ZSAnPycsICcvJyxcbiAgICAgICAgLy8nIycuIEZpeGVzIFNhZmFyaSBidWcgW2lzc3VlICM4XVxuICAgICAgICBwYXRoID0gZW5jb2RlVVJJKHBhdGgpO1xuICAgICAgICBpZihfaXNJRSAmJiBfaXNMb2NhbCl7XG4gICAgICAgICAgICAvL2ZpeCBJRTggbG9jYWwgZmlsZSBidWcgW2lzc3VlICM2XVxuICAgICAgICAgICAgcGF0aCA9IHBhdGgucmVwbGFjZSgvXFw/LywgJyUzRicpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBwYXRoO1xuICAgIH1cblxuICAgIC8vLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICAvLyBQdWJsaWMgKEFQSSlcbiAgICAvLy0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbiAgICBoYXNoZXIgPSAvKiogQGxlbmRzIGhhc2hlciAqLyB7XG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIGhhc2hlciBWZXJzaW9uIE51bWJlclxuICAgICAgICAgKiBAdHlwZSBzdHJpbmdcbiAgICAgICAgICogQGNvbnN0YW50XG4gICAgICAgICAqL1xuICAgICAgICBWRVJTSU9OIDogJzEuMi4wJyxcblxuICAgICAgICAvKipcbiAgICAgICAgICogQm9vbGVhbiBkZWNpZGluZyBpZiBoYXNoZXIgZW5jb2Rlcy9kZWNvZGVzIHRoZSBoYXNoIG9yIG5vdC5cbiAgICAgICAgICogPHVsPlxuICAgICAgICAgKiA8bGk+ZGVmYXVsdCB2YWx1ZTogZmFsc2U7PC9saT5cbiAgICAgICAgICogPC91bD5cbiAgICAgICAgICogQHR5cGUgYm9vbGVhblxuICAgICAgICAgKi9cbiAgICAgICAgcmF3IDogZmFsc2UsXG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIFN0cmluZyB0aGF0IHNob3VsZCBhbHdheXMgYmUgYWRkZWQgdG8gdGhlIGVuZCBvZiBIYXNoIHZhbHVlLlxuICAgICAgICAgKiA8dWw+XG4gICAgICAgICAqIDxsaT5kZWZhdWx0IHZhbHVlOiAnJzs8L2xpPlxuICAgICAgICAgKiA8bGk+d2lsbCBiZSBhdXRvbWF0aWNhbGx5IHJlbW92ZWQgZnJvbSBgaGFzaGVyLmdldEhhc2goKWA8L2xpPlxuICAgICAgICAgKiA8bGk+YXZvaWQgY29uZmxpY3RzIHdpdGggZWxlbWVudHMgdGhhdCBjb250YWluIElEIGVxdWFsIHRvIGhhc2ggdmFsdWU7PC9saT5cbiAgICAgICAgICogPC91bD5cbiAgICAgICAgICogQHR5cGUgc3RyaW5nXG4gICAgICAgICAqL1xuICAgICAgICBhcHBlbmRIYXNoIDogJycsXG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIFN0cmluZyB0aGF0IHNob3VsZCBhbHdheXMgYmUgYWRkZWQgdG8gdGhlIGJlZ2lubmluZyBvZiBIYXNoIHZhbHVlLlxuICAgICAgICAgKiA8dWw+XG4gICAgICAgICAqIDxsaT5kZWZhdWx0IHZhbHVlOiAnLyc7PC9saT5cbiAgICAgICAgICogPGxpPndpbGwgYmUgYXV0b21hdGljYWxseSByZW1vdmVkIGZyb20gYGhhc2hlci5nZXRIYXNoKClgPC9saT5cbiAgICAgICAgICogPGxpPmF2b2lkIGNvbmZsaWN0cyB3aXRoIGVsZW1lbnRzIHRoYXQgY29udGFpbiBJRCBlcXVhbCB0byBoYXNoIHZhbHVlOzwvbGk+XG4gICAgICAgICAqIDwvdWw+XG4gICAgICAgICAqIEB0eXBlIHN0cmluZ1xuICAgICAgICAgKi9cbiAgICAgICAgcHJlcGVuZEhhc2ggOiAnLycsXG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIFN0cmluZyB1c2VkIHRvIHNwbGl0IGhhc2ggcGF0aHM7IHVzZWQgYnkgYGhhc2hlci5nZXRIYXNoQXNBcnJheSgpYCB0byBzcGxpdCBwYXRocy5cbiAgICAgICAgICogPHVsPlxuICAgICAgICAgKiA8bGk+ZGVmYXVsdCB2YWx1ZTogJy8nOzwvbGk+XG4gICAgICAgICAqIDwvdWw+XG4gICAgICAgICAqIEB0eXBlIHN0cmluZ1xuICAgICAgICAgKi9cbiAgICAgICAgc2VwYXJhdG9yIDogJy8nLFxuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBTaWduYWwgZGlzcGF0Y2hlZCB3aGVuIGhhc2ggdmFsdWUgY2hhbmdlcy5cbiAgICAgICAgICogLSBwYXNzIGN1cnJlbnQgaGFzaCBhcyAxc3QgcGFyYW1ldGVyIHRvIGxpc3RlbmVycyBhbmQgcHJldmlvdXMgaGFzaCB2YWx1ZSBhcyAybmQgcGFyYW1ldGVyLlxuICAgICAgICAgKiBAdHlwZSBzaWduYWxzLlNpZ25hbFxuICAgICAgICAgKi9cbiAgICAgICAgY2hhbmdlZCA6IG5ldyBTaWduYWwoKSxcblxuICAgICAgICAvKipcbiAgICAgICAgICogU2lnbmFsIGRpc3BhdGNoZWQgd2hlbiBoYXNoZXIgaXMgc3RvcHBlZC5cbiAgICAgICAgICogLSAgcGFzcyBjdXJyZW50IGhhc2ggYXMgZmlyc3QgcGFyYW1ldGVyIHRvIGxpc3RlbmVyc1xuICAgICAgICAgKiBAdHlwZSBzaWduYWxzLlNpZ25hbFxuICAgICAgICAgKi9cbiAgICAgICAgc3RvcHBlZCA6IG5ldyBTaWduYWwoKSxcblxuICAgICAgICAvKipcbiAgICAgICAgICogU2lnbmFsIGRpc3BhdGNoZWQgd2hlbiBoYXNoZXIgaXMgaW5pdGlhbGl6ZWQuXG4gICAgICAgICAqIC0gcGFzcyBjdXJyZW50IGhhc2ggYXMgZmlyc3QgcGFyYW1ldGVyIHRvIGxpc3RlbmVycy5cbiAgICAgICAgICogQHR5cGUgc2lnbmFscy5TaWduYWxcbiAgICAgICAgICovXG4gICAgICAgIGluaXRpYWxpemVkIDogbmV3IFNpZ25hbCgpLFxuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBTdGFydCBsaXN0ZW5pbmcvZGlzcGF0Y2hpbmcgY2hhbmdlcyBpbiB0aGUgaGFzaC9oaXN0b3J5LlxuICAgICAgICAgKiA8dWw+XG4gICAgICAgICAqICAgPGxpPmhhc2hlciB3b24ndCBkaXNwYXRjaCBDSEFOR0UgZXZlbnRzIGJ5IG1hbnVhbGx5IHR5cGluZyBhIG5ldyB2YWx1ZSBvciBwcmVzc2luZyB0aGUgYmFjay9mb3J3YXJkIGJ1dHRvbnMgYmVmb3JlIGNhbGxpbmcgdGhpcyBtZXRob2QuPC9saT5cbiAgICAgICAgICogPC91bD5cbiAgICAgICAgICovXG4gICAgICAgIGluaXQgOiBmdW5jdGlvbigpe1xuICAgICAgICAgICAgaWYoX2lzQWN0aXZlKSByZXR1cm47XG5cbiAgICAgICAgICAgIF9oYXNoID0gX2dldFdpbmRvd0hhc2goKTtcblxuICAgICAgICAgICAgLy90aG91Z2h0IGFib3V0IGJyYW5jaGluZy9vdmVybG9hZGluZyBoYXNoZXIuaW5pdCgpIHRvIGF2b2lkIGNoZWNraW5nIG11bHRpcGxlIHRpbWVzIGJ1dFxuICAgICAgICAgICAgLy9kb24ndCB0aGluayB3b3J0aCBkb2luZyBpdCBzaW5jZSBpdCBwcm9iYWJseSB3b24ndCBiZSBjYWxsZWQgbXVsdGlwbGUgdGltZXMuXG4gICAgICAgICAgICBpZihfaXNIYXNoQ2hhbmdlU3VwcG9ydGVkKXtcbiAgICAgICAgICAgICAgICBfYWRkTGlzdGVuZXIod2luZG93LCAnaGFzaGNoYW5nZScsIF9jaGVja0hpc3RvcnkpO1xuICAgICAgICAgICAgfWVsc2Uge1xuICAgICAgICAgICAgICAgIGlmKF9pc0xlZ2FjeUlFKXtcbiAgICAgICAgICAgICAgICAgICAgaWYoISBfZnJhbWUpe1xuICAgICAgICAgICAgICAgICAgICAgICAgX2NyZWF0ZUZyYW1lKCk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgX3VwZGF0ZUZyYW1lKCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIF9jaGVja0ludGVydmFsID0gc2V0SW50ZXJ2YWwoX2NoZWNrSGlzdG9yeSwgUE9PTF9JTlRFUlZBTCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIF9pc0FjdGl2ZSA9IHRydWU7XG4gICAgICAgICAgICBoYXNoZXIuaW5pdGlhbGl6ZWQuZGlzcGF0Y2goX3RyaW1IYXNoKF9oYXNoKSk7XG4gICAgICAgIH0sXG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIFN0b3AgbGlzdGVuaW5nL2Rpc3BhdGNoaW5nIGNoYW5nZXMgaW4gdGhlIGhhc2gvaGlzdG9yeS5cbiAgICAgICAgICogPHVsPlxuICAgICAgICAgKiAgIDxsaT5oYXNoZXIgd29uJ3QgZGlzcGF0Y2ggQ0hBTkdFIGV2ZW50cyBieSBtYW51YWxseSB0eXBpbmcgYSBuZXcgdmFsdWUgb3IgcHJlc3NpbmcgdGhlIGJhY2svZm9yd2FyZCBidXR0b25zIGFmdGVyIGNhbGxpbmcgdGhpcyBtZXRob2QsIHVubGVzcyB5b3UgY2FsbCBoYXNoZXIuaW5pdCgpIGFnYWluLjwvbGk+XG4gICAgICAgICAqICAgPGxpPmhhc2hlciB3aWxsIHN0aWxsIGRpc3BhdGNoIGNoYW5nZXMgbWFkZSBwcm9ncmFtYXRpY2FsbHkgYnkgY2FsbGluZyBoYXNoZXIuc2V0SGFzaCgpOzwvbGk+XG4gICAgICAgICAqIDwvdWw+XG4gICAgICAgICAqL1xuICAgICAgICBzdG9wIDogZnVuY3Rpb24oKXtcbiAgICAgICAgICAgIGlmKCEgX2lzQWN0aXZlKSByZXR1cm47XG5cbiAgICAgICAgICAgIGlmKF9pc0hhc2hDaGFuZ2VTdXBwb3J0ZWQpe1xuICAgICAgICAgICAgICAgIF9yZW1vdmVMaXN0ZW5lcih3aW5kb3csICdoYXNoY2hhbmdlJywgX2NoZWNrSGlzdG9yeSk7XG4gICAgICAgICAgICB9ZWxzZXtcbiAgICAgICAgICAgICAgICBjbGVhckludGVydmFsKF9jaGVja0ludGVydmFsKTtcbiAgICAgICAgICAgICAgICBfY2hlY2tJbnRlcnZhbCA9IG51bGw7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIF9pc0FjdGl2ZSA9IGZhbHNlO1xuICAgICAgICAgICAgaGFzaGVyLnN0b3BwZWQuZGlzcGF0Y2goX3RyaW1IYXNoKF9oYXNoKSk7XG4gICAgICAgIH0sXG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIEByZXR1cm4ge2Jvb2xlYW59ICAgIElmIGhhc2hlciBpcyBsaXN0ZW5pbmcgdG8gY2hhbmdlcyBvbiB0aGUgYnJvd3NlciBoaXN0b3J5IGFuZC9vciBoYXNoIHZhbHVlLlxuICAgICAgICAgKi9cbiAgICAgICAgaXNBY3RpdmUgOiBmdW5jdGlvbigpe1xuICAgICAgICAgICAgcmV0dXJuIF9pc0FjdGl2ZTtcbiAgICAgICAgfSxcblxuICAgICAgICAvKipcbiAgICAgICAgICogQHJldHVybiB7c3RyaW5nfSBGdWxsIFVSTC5cbiAgICAgICAgICovXG4gICAgICAgIGdldFVSTCA6IGZ1bmN0aW9uKCl7XG4gICAgICAgICAgICByZXR1cm4gd2luZG93LmxvY2F0aW9uLmhyZWY7XG4gICAgICAgIH0sXG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIEByZXR1cm4ge3N0cmluZ30gUmV0cmlldmUgVVJMIHdpdGhvdXQgcXVlcnkgc3RyaW5nIGFuZCBoYXNoLlxuICAgICAgICAgKi9cbiAgICAgICAgZ2V0QmFzZVVSTCA6IGZ1bmN0aW9uKCl7XG4gICAgICAgICAgICByZXR1cm4gaGFzaGVyLmdldFVSTCgpLnJlcGxhY2UoX2Jhc2VVcmxSZWdleHAsICcnKTsgLy9yZW1vdmVzIGV2ZXJ5dGhpbmcgYWZ0ZXIgJz8nIGFuZC9vciAnIydcbiAgICAgICAgfSxcblxuICAgICAgICAvKipcbiAgICAgICAgICogU2V0IEhhc2ggdmFsdWUsIGdlbmVyYXRpbmcgYSBuZXcgaGlzdG9yeSByZWNvcmQuXG4gICAgICAgICAqIEBwYXJhbSB7Li4uc3RyaW5nfSBwYXRoICAgIEhhc2ggdmFsdWUgd2l0aG91dCAnIycuIEhhc2hlciB3aWxsIGpvaW5cbiAgICAgICAgICogcGF0aCBzZWdtZW50cyB1c2luZyBgaGFzaGVyLnNlcGFyYXRvcmAgYW5kIHByZXBlbmQvYXBwZW5kIGhhc2ggdmFsdWVcbiAgICAgICAgICogd2l0aCBgaGFzaGVyLmFwcGVuZEhhc2hgIGFuZCBgaGFzaGVyLnByZXBlbmRIYXNoYFxuICAgICAgICAgKiBAZXhhbXBsZSBoYXNoZXIuc2V0SGFzaCgnbG9yZW0nLCAnaXBzdW0nLCAnZG9sb3InKSAtPiAnIy9sb3JlbS9pcHN1bS9kb2xvcidcbiAgICAgICAgICovXG4gICAgICAgIHNldEhhc2ggOiBmdW5jdGlvbihwYXRoKXtcbiAgICAgICAgICAgIHBhdGggPSBfbWFrZVBhdGguYXBwbHkobnVsbCwgYXJndW1lbnRzKTtcbiAgICAgICAgICAgIGlmKHBhdGggIT09IF9oYXNoKXtcbiAgICAgICAgICAgICAgICAvLyB3ZSBzaG91bGQgc3RvcmUgcmF3IHZhbHVlXG4gICAgICAgICAgICAgICAgX3JlZ2lzdGVyQ2hhbmdlKHBhdGgpO1xuICAgICAgICAgICAgICAgIGlmIChwYXRoID09PSBfaGFzaCkge1xuICAgICAgICAgICAgICAgICAgICAvLyB3ZSBjaGVjayBpZiBwYXRoIGlzIHN0aWxsID09PSBfaGFzaCB0byBhdm9pZCBlcnJvciBpblxuICAgICAgICAgICAgICAgICAgICAvLyBjYXNlIG9mIG11bHRpcGxlIGNvbnNlY3V0aXZlIHJlZGlyZWN0cyBbaXNzdWUgIzM5XVxuICAgICAgICAgICAgICAgICAgICBpZiAoISBoYXNoZXIucmF3KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBwYXRoID0gX2VuY29kZVBhdGgocGF0aCk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgd2luZG93LmxvY2F0aW9uLmhhc2ggPSAnIycgKyBwYXRoO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcblxuICAgICAgICAvKipcbiAgICAgICAgICogU2V0IEhhc2ggdmFsdWUgd2l0aG91dCBrZWVwaW5nIHByZXZpb3VzIGhhc2ggb24gdGhlIGhpc3RvcnkgcmVjb3JkLlxuICAgICAgICAgKiBTaW1pbGFyIHRvIGNhbGxpbmcgYHdpbmRvdy5sb2NhdGlvbi5yZXBsYWNlKFwiIy9oYXNoXCIpYCBidXQgd2lsbCBhbHNvIHdvcmsgb24gSUU2LTcuXG4gICAgICAgICAqIEBwYXJhbSB7Li4uc3RyaW5nfSBwYXRoICAgIEhhc2ggdmFsdWUgd2l0aG91dCAnIycuIEhhc2hlciB3aWxsIGpvaW5cbiAgICAgICAgICogcGF0aCBzZWdtZW50cyB1c2luZyBgaGFzaGVyLnNlcGFyYXRvcmAgYW5kIHByZXBlbmQvYXBwZW5kIGhhc2ggdmFsdWVcbiAgICAgICAgICogd2l0aCBgaGFzaGVyLmFwcGVuZEhhc2hgIGFuZCBgaGFzaGVyLnByZXBlbmRIYXNoYFxuICAgICAgICAgKiBAZXhhbXBsZSBoYXNoZXIucmVwbGFjZUhhc2goJ2xvcmVtJywgJ2lwc3VtJywgJ2RvbG9yJykgLT4gJyMvbG9yZW0vaXBzdW0vZG9sb3InXG4gICAgICAgICAqL1xuICAgICAgICByZXBsYWNlSGFzaCA6IGZ1bmN0aW9uKHBhdGgpe1xuICAgICAgICAgICAgcGF0aCA9IF9tYWtlUGF0aC5hcHBseShudWxsLCBhcmd1bWVudHMpO1xuICAgICAgICAgICAgaWYocGF0aCAhPT0gX2hhc2gpe1xuICAgICAgICAgICAgICAgIC8vIHdlIHNob3VsZCBzdG9yZSByYXcgdmFsdWVcbiAgICAgICAgICAgICAgICBfcmVnaXN0ZXJDaGFuZ2UocGF0aCwgdHJ1ZSk7XG4gICAgICAgICAgICAgICAgaWYgKHBhdGggPT09IF9oYXNoKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIHdlIGNoZWNrIGlmIHBhdGggaXMgc3RpbGwgPT09IF9oYXNoIHRvIGF2b2lkIGVycm9yIGluXG4gICAgICAgICAgICAgICAgICAgIC8vIGNhc2Ugb2YgbXVsdGlwbGUgY29uc2VjdXRpdmUgcmVkaXJlY3RzIFtpc3N1ZSAjMzldXG4gICAgICAgICAgICAgICAgICAgIGlmICghIGhhc2hlci5yYXcpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHBhdGggPSBfZW5jb2RlUGF0aChwYXRoKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB3aW5kb3cubG9jYXRpb24ucmVwbGFjZSgnIycgKyBwYXRoKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sXG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIEByZXR1cm4ge3N0cmluZ30gSGFzaCB2YWx1ZSB3aXRob3V0ICcjJywgYGhhc2hlci5hcHBlbmRIYXNoYCBhbmQgYGhhc2hlci5wcmVwZW5kSGFzaGAuXG4gICAgICAgICAqL1xuICAgICAgICBnZXRIYXNoIDogZnVuY3Rpb24oKXtcbiAgICAgICAgICAgIC8vZGlkbid0IHVzZWQgYWN0dWFsIHZhbHVlIG9mIHRoZSBgd2luZG93LmxvY2F0aW9uLmhhc2hgIHRvIGF2b2lkIGJyZWFraW5nIHRoZSBhcHBsaWNhdGlvbiBpbiBjYXNlIGB3aW5kb3cubG9jYXRpb24uaGFzaGAgaXNuJ3QgYXZhaWxhYmxlIGFuZCBhbHNvIGJlY2F1c2UgdmFsdWUgc2hvdWxkIGFsd2F5cyBiZSBzeW5jaGVkLlxuICAgICAgICAgICAgcmV0dXJuIF90cmltSGFzaChfaGFzaCk7XG4gICAgICAgIH0sXG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIEByZXR1cm4ge0FycmF5LjxzdHJpbmc+fSBIYXNoIHZhbHVlIHNwbGl0IGludG8gYW4gQXJyYXkuXG4gICAgICAgICAqL1xuICAgICAgICBnZXRIYXNoQXNBcnJheSA6IGZ1bmN0aW9uKCl7XG4gICAgICAgICAgICByZXR1cm4gaGFzaGVyLmdldEhhc2goKS5zcGxpdChoYXNoZXIuc2VwYXJhdG9yKTtcbiAgICAgICAgfSxcblxuICAgICAgICAvKipcbiAgICAgICAgICogUmVtb3ZlcyBhbGwgZXZlbnQgbGlzdGVuZXJzLCBzdG9wcyBoYXNoZXIgYW5kIGRlc3Ryb3kgaGFzaGVyIG9iamVjdC5cbiAgICAgICAgICogLSBJTVBPUlRBTlQ6IGhhc2hlciB3b24ndCB3b3JrIGFmdGVyIGNhbGxpbmcgdGhpcyBtZXRob2QsIGhhc2hlciBPYmplY3Qgd2lsbCBiZSBkZWxldGVkLlxuICAgICAgICAgKi9cbiAgICAgICAgZGlzcG9zZSA6IGZ1bmN0aW9uKCl7XG4gICAgICAgICAgICBoYXNoZXIuc3RvcCgpO1xuICAgICAgICAgICAgaGFzaGVyLmluaXRpYWxpemVkLmRpc3Bvc2UoKTtcbiAgICAgICAgICAgIGhhc2hlci5zdG9wcGVkLmRpc3Bvc2UoKTtcbiAgICAgICAgICAgIGhhc2hlci5jaGFuZ2VkLmRpc3Bvc2UoKTtcbiAgICAgICAgICAgIF9mcmFtZSA9IGhhc2hlciA9IHdpbmRvdy5oYXNoZXIgPSBudWxsO1xuICAgICAgICB9LFxuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBAcmV0dXJuIHtzdHJpbmd9IEEgc3RyaW5nIHJlcHJlc2VudGF0aW9uIG9mIHRoZSBvYmplY3QuXG4gICAgICAgICAqL1xuICAgICAgICB0b1N0cmluZyA6IGZ1bmN0aW9uKCl7XG4gICAgICAgICAgICByZXR1cm4gJ1toYXNoZXIgdmVyc2lvbj1cIicrIGhhc2hlci5WRVJTSU9OICsnXCIgaGFzaD1cIicrIGhhc2hlci5nZXRIYXNoKCkgKydcIl0nO1xuICAgICAgICB9XG5cbiAgICB9O1xuXG4gICAgaGFzaGVyLmluaXRpYWxpemVkLm1lbW9yaXplID0gdHJ1ZTsgLy9zZWUgIzMzXG5cbiAgICByZXR1cm4gaGFzaGVyO1xuXG59KHdpbmRvdykpO1xuXG5cbiAgICByZXR1cm4gaGFzaGVyO1xufTtcblxuaWYgKHR5cGVvZiBkZWZpbmUgPT09ICdmdW5jdGlvbicgJiYgZGVmaW5lLmFtZCkge1xuICAgIGRlZmluZShbJ3NpZ25hbHMnXSwgZmFjdG9yeSk7XG59IGVsc2UgaWYgKHR5cGVvZiBleHBvcnRzID09PSAnb2JqZWN0Jykge1xuICAgIG1vZHVsZS5leHBvcnRzID0gZmFjdG9yeShyZXF1aXJlKCdzaWduYWxzJykpO1xufSBlbHNlIHtcbiAgICAvKmpzaGludCBzdWI6dHJ1ZSAqL1xuICAgIHdpbmRvd1snaGFzaGVyJ10gPSBmYWN0b3J5KHdpbmRvd1snc2lnbmFscyddKTtcbn1cblxufSgpKTtcbiIsIi8qanNsaW50IG9uZXZhcjp0cnVlLCB1bmRlZjp0cnVlLCBuZXdjYXA6dHJ1ZSwgcmVnZXhwOnRydWUsIGJpdHdpc2U6dHJ1ZSwgbWF4ZXJyOjUwLCBpbmRlbnQ6NCwgd2hpdGU6ZmFsc2UsIG5vbWVuOmZhbHNlLCBwbHVzcGx1czpmYWxzZSAqL1xuLypnbG9iYWwgZGVmaW5lOmZhbHNlLCByZXF1aXJlOmZhbHNlLCBleHBvcnRzOmZhbHNlLCBtb2R1bGU6ZmFsc2UsIHNpZ25hbHM6ZmFsc2UgKi9cblxuLyoqIEBsaWNlbnNlXG4gKiBKUyBTaWduYWxzIDxodHRwOi8vbWlsbGVybWVkZWlyb3MuZ2l0aHViLmNvbS9qcy1zaWduYWxzLz5cbiAqIFJlbGVhc2VkIHVuZGVyIHRoZSBNSVQgbGljZW5zZVxuICogQXV0aG9yOiBNaWxsZXIgTWVkZWlyb3NcbiAqIFZlcnNpb246IDEuMC4wIC0gQnVpbGQ6IDI2OCAoMjAxMi8xMS8yOSAwNTo0OCBQTSlcbiAqL1xuXG4oZnVuY3Rpb24oZ2xvYmFsKXtcblxuICAgIC8vIFNpZ25hbEJpbmRpbmcgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIC8vPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG4gICAgLyoqXG4gICAgICogT2JqZWN0IHRoYXQgcmVwcmVzZW50cyBhIGJpbmRpbmcgYmV0d2VlbiBhIFNpZ25hbCBhbmQgYSBsaXN0ZW5lciBmdW5jdGlvbi5cbiAgICAgKiA8YnIgLz4tIDxzdHJvbmc+VGhpcyBpcyBhbiBpbnRlcm5hbCBjb25zdHJ1Y3RvciBhbmQgc2hvdWxkbid0IGJlIGNhbGxlZCBieSByZWd1bGFyIHVzZXJzLjwvc3Ryb25nPlxuICAgICAqIDxiciAvPi0gaW5zcGlyZWQgYnkgSm9hIEViZXJ0IEFTMyBTaWduYWxCaW5kaW5nIGFuZCBSb2JlcnQgUGVubmVyJ3MgU2xvdCBjbGFzc2VzLlxuICAgICAqIEBhdXRob3IgTWlsbGVyIE1lZGVpcm9zXG4gICAgICogQGNvbnN0cnVjdG9yXG4gICAgICogQGludGVybmFsXG4gICAgICogQG5hbWUgU2lnbmFsQmluZGluZ1xuICAgICAqIEBwYXJhbSB7U2lnbmFsfSBzaWduYWwgUmVmZXJlbmNlIHRvIFNpZ25hbCBvYmplY3QgdGhhdCBsaXN0ZW5lciBpcyBjdXJyZW50bHkgYm91bmQgdG8uXG4gICAgICogQHBhcmFtIHtGdW5jdGlvbn0gbGlzdGVuZXIgSGFuZGxlciBmdW5jdGlvbiBib3VuZCB0byB0aGUgc2lnbmFsLlxuICAgICAqIEBwYXJhbSB7Ym9vbGVhbn0gaXNPbmNlIElmIGJpbmRpbmcgc2hvdWxkIGJlIGV4ZWN1dGVkIGp1c3Qgb25jZS5cbiAgICAgKiBAcGFyYW0ge09iamVjdH0gW2xpc3RlbmVyQ29udGV4dF0gQ29udGV4dCBvbiB3aGljaCBsaXN0ZW5lciB3aWxsIGJlIGV4ZWN1dGVkIChvYmplY3QgdGhhdCBzaG91bGQgcmVwcmVzZW50IHRoZSBgdGhpc2AgdmFyaWFibGUgaW5zaWRlIGxpc3RlbmVyIGZ1bmN0aW9uKS5cbiAgICAgKiBAcGFyYW0ge051bWJlcn0gW3ByaW9yaXR5XSBUaGUgcHJpb3JpdHkgbGV2ZWwgb2YgdGhlIGV2ZW50IGxpc3RlbmVyLiAoZGVmYXVsdCA9IDApLlxuICAgICAqL1xuICAgIGZ1bmN0aW9uIFNpZ25hbEJpbmRpbmcoc2lnbmFsLCBsaXN0ZW5lciwgaXNPbmNlLCBsaXN0ZW5lckNvbnRleHQsIHByaW9yaXR5KSB7XG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIEhhbmRsZXIgZnVuY3Rpb24gYm91bmQgdG8gdGhlIHNpZ25hbC5cbiAgICAgICAgICogQHR5cGUgRnVuY3Rpb25cbiAgICAgICAgICogQHByaXZhdGVcbiAgICAgICAgICovXG4gICAgICAgIHRoaXMuX2xpc3RlbmVyID0gbGlzdGVuZXI7XG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIElmIGJpbmRpbmcgc2hvdWxkIGJlIGV4ZWN1dGVkIGp1c3Qgb25jZS5cbiAgICAgICAgICogQHR5cGUgYm9vbGVhblxuICAgICAgICAgKiBAcHJpdmF0ZVxuICAgICAgICAgKi9cbiAgICAgICAgdGhpcy5faXNPbmNlID0gaXNPbmNlO1xuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBDb250ZXh0IG9uIHdoaWNoIGxpc3RlbmVyIHdpbGwgYmUgZXhlY3V0ZWQgKG9iamVjdCB0aGF0IHNob3VsZCByZXByZXNlbnQgdGhlIGB0aGlzYCB2YXJpYWJsZSBpbnNpZGUgbGlzdGVuZXIgZnVuY3Rpb24pLlxuICAgICAgICAgKiBAbWVtYmVyT2YgU2lnbmFsQmluZGluZy5wcm90b3R5cGVcbiAgICAgICAgICogQG5hbWUgY29udGV4dFxuICAgICAgICAgKiBAdHlwZSBPYmplY3R8dW5kZWZpbmVkfG51bGxcbiAgICAgICAgICovXG4gICAgICAgIHRoaXMuY29udGV4dCA9IGxpc3RlbmVyQ29udGV4dDtcblxuICAgICAgICAvKipcbiAgICAgICAgICogUmVmZXJlbmNlIHRvIFNpZ25hbCBvYmplY3QgdGhhdCBsaXN0ZW5lciBpcyBjdXJyZW50bHkgYm91bmQgdG8uXG4gICAgICAgICAqIEB0eXBlIFNpZ25hbFxuICAgICAgICAgKiBAcHJpdmF0ZVxuICAgICAgICAgKi9cbiAgICAgICAgdGhpcy5fc2lnbmFsID0gc2lnbmFsO1xuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBMaXN0ZW5lciBwcmlvcml0eVxuICAgICAgICAgKiBAdHlwZSBOdW1iZXJcbiAgICAgICAgICogQHByaXZhdGVcbiAgICAgICAgICovXG4gICAgICAgIHRoaXMuX3ByaW9yaXR5ID0gcHJpb3JpdHkgfHwgMDtcbiAgICB9XG5cbiAgICBTaWduYWxCaW5kaW5nLnByb3RvdHlwZSA9IHtcblxuICAgICAgICAvKipcbiAgICAgICAgICogSWYgYmluZGluZyBpcyBhY3RpdmUgYW5kIHNob3VsZCBiZSBleGVjdXRlZC5cbiAgICAgICAgICogQHR5cGUgYm9vbGVhblxuICAgICAgICAgKi9cbiAgICAgICAgYWN0aXZlIDogdHJ1ZSxcblxuICAgICAgICAvKipcbiAgICAgICAgICogRGVmYXVsdCBwYXJhbWV0ZXJzIHBhc3NlZCB0byBsaXN0ZW5lciBkdXJpbmcgYFNpZ25hbC5kaXNwYXRjaGAgYW5kIGBTaWduYWxCaW5kaW5nLmV4ZWN1dGVgLiAoY3VycmllZCBwYXJhbWV0ZXJzKVxuICAgICAgICAgKiBAdHlwZSBBcnJheXxudWxsXG4gICAgICAgICAqL1xuICAgICAgICBwYXJhbXMgOiBudWxsLFxuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBDYWxsIGxpc3RlbmVyIHBhc3NpbmcgYXJiaXRyYXJ5IHBhcmFtZXRlcnMuXG4gICAgICAgICAqIDxwPklmIGJpbmRpbmcgd2FzIGFkZGVkIHVzaW5nIGBTaWduYWwuYWRkT25jZSgpYCBpdCB3aWxsIGJlIGF1dG9tYXRpY2FsbHkgcmVtb3ZlZCBmcm9tIHNpZ25hbCBkaXNwYXRjaCBxdWV1ZSwgdGhpcyBtZXRob2QgaXMgdXNlZCBpbnRlcm5hbGx5IGZvciB0aGUgc2lnbmFsIGRpc3BhdGNoLjwvcD5cbiAgICAgICAgICogQHBhcmFtIHtBcnJheX0gW3BhcmFtc0Fycl0gQXJyYXkgb2YgcGFyYW1ldGVycyB0aGF0IHNob3VsZCBiZSBwYXNzZWQgdG8gdGhlIGxpc3RlbmVyXG4gICAgICAgICAqIEByZXR1cm4geyp9IFZhbHVlIHJldHVybmVkIGJ5IHRoZSBsaXN0ZW5lci5cbiAgICAgICAgICovXG4gICAgICAgIGV4ZWN1dGUgOiBmdW5jdGlvbiAocGFyYW1zQXJyKSB7XG4gICAgICAgICAgICB2YXIgaGFuZGxlclJldHVybiwgcGFyYW1zO1xuICAgICAgICAgICAgaWYgKHRoaXMuYWN0aXZlICYmICEhdGhpcy5fbGlzdGVuZXIpIHtcbiAgICAgICAgICAgICAgICBwYXJhbXMgPSB0aGlzLnBhcmFtcz8gdGhpcy5wYXJhbXMuY29uY2F0KHBhcmFtc0FycikgOiBwYXJhbXNBcnI7XG4gICAgICAgICAgICAgICAgaGFuZGxlclJldHVybiA9IHRoaXMuX2xpc3RlbmVyLmFwcGx5KHRoaXMuY29udGV4dCwgcGFyYW1zKTtcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5faXNPbmNlKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuZGV0YWNoKCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIGhhbmRsZXJSZXR1cm47XG4gICAgICAgIH0sXG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIERldGFjaCBiaW5kaW5nIGZyb20gc2lnbmFsLlxuICAgICAgICAgKiAtIGFsaWFzIHRvOiBteVNpZ25hbC5yZW1vdmUobXlCaW5kaW5nLmdldExpc3RlbmVyKCkpO1xuICAgICAgICAgKiBAcmV0dXJuIHtGdW5jdGlvbnxudWxsfSBIYW5kbGVyIGZ1bmN0aW9uIGJvdW5kIHRvIHRoZSBzaWduYWwgb3IgYG51bGxgIGlmIGJpbmRpbmcgd2FzIHByZXZpb3VzbHkgZGV0YWNoZWQuXG4gICAgICAgICAqL1xuICAgICAgICBkZXRhY2ggOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5pc0JvdW5kKCk/IHRoaXMuX3NpZ25hbC5yZW1vdmUodGhpcy5fbGlzdGVuZXIsIHRoaXMuY29udGV4dCkgOiBudWxsO1xuICAgICAgICB9LFxuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBAcmV0dXJuIHtCb29sZWFufSBgdHJ1ZWAgaWYgYmluZGluZyBpcyBzdGlsbCBib3VuZCB0byB0aGUgc2lnbmFsIGFuZCBoYXZlIGEgbGlzdGVuZXIuXG4gICAgICAgICAqL1xuICAgICAgICBpc0JvdW5kIDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgcmV0dXJuICghIXRoaXMuX3NpZ25hbCAmJiAhIXRoaXMuX2xpc3RlbmVyKTtcbiAgICAgICAgfSxcblxuICAgICAgICAvKipcbiAgICAgICAgICogQHJldHVybiB7Ym9vbGVhbn0gSWYgU2lnbmFsQmluZGluZyB3aWxsIG9ubHkgYmUgZXhlY3V0ZWQgb25jZS5cbiAgICAgICAgICovXG4gICAgICAgIGlzT25jZSA6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl9pc09uY2U7XG4gICAgICAgIH0sXG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIEByZXR1cm4ge0Z1bmN0aW9ufSBIYW5kbGVyIGZ1bmN0aW9uIGJvdW5kIHRvIHRoZSBzaWduYWwuXG4gICAgICAgICAqL1xuICAgICAgICBnZXRMaXN0ZW5lciA6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl9saXN0ZW5lcjtcbiAgICAgICAgfSxcblxuICAgICAgICAvKipcbiAgICAgICAgICogQHJldHVybiB7U2lnbmFsfSBTaWduYWwgdGhhdCBsaXN0ZW5lciBpcyBjdXJyZW50bHkgYm91bmQgdG8uXG4gICAgICAgICAqL1xuICAgICAgICBnZXRTaWduYWwgOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5fc2lnbmFsO1xuICAgICAgICB9LFxuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBEZWxldGUgaW5zdGFuY2UgcHJvcGVydGllc1xuICAgICAgICAgKiBAcHJpdmF0ZVxuICAgICAgICAgKi9cbiAgICAgICAgX2Rlc3Ryb3kgOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICBkZWxldGUgdGhpcy5fc2lnbmFsO1xuICAgICAgICAgICAgZGVsZXRlIHRoaXMuX2xpc3RlbmVyO1xuICAgICAgICAgICAgZGVsZXRlIHRoaXMuY29udGV4dDtcbiAgICAgICAgfSxcblxuICAgICAgICAvKipcbiAgICAgICAgICogQHJldHVybiB7c3RyaW5nfSBTdHJpbmcgcmVwcmVzZW50YXRpb24gb2YgdGhlIG9iamVjdC5cbiAgICAgICAgICovXG4gICAgICAgIHRvU3RyaW5nIDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgcmV0dXJuICdbU2lnbmFsQmluZGluZyBpc09uY2U6JyArIHRoaXMuX2lzT25jZSArJywgaXNCb3VuZDonKyB0aGlzLmlzQm91bmQoKSArJywgYWN0aXZlOicgKyB0aGlzLmFjdGl2ZSArICddJztcbiAgICAgICAgfVxuXG4gICAgfTtcblxuXG4vKmdsb2JhbCBTaWduYWxCaW5kaW5nOmZhbHNlKi9cblxuICAgIC8vIFNpZ25hbCAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIC8vPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG4gICAgZnVuY3Rpb24gdmFsaWRhdGVMaXN0ZW5lcihsaXN0ZW5lciwgZm5OYW1lKSB7XG4gICAgICAgIGlmICh0eXBlb2YgbGlzdGVuZXIgIT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvciggJ2xpc3RlbmVyIGlzIGEgcmVxdWlyZWQgcGFyYW0gb2Yge2ZufSgpIGFuZCBzaG91bGQgYmUgYSBGdW5jdGlvbi4nLnJlcGxhY2UoJ3tmbn0nLCBmbk5hbWUpICk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBDdXN0b20gZXZlbnQgYnJvYWRjYXN0ZXJcbiAgICAgKiA8YnIgLz4tIGluc3BpcmVkIGJ5IFJvYmVydCBQZW5uZXIncyBBUzMgU2lnbmFscy5cbiAgICAgKiBAbmFtZSBTaWduYWxcbiAgICAgKiBAYXV0aG9yIE1pbGxlciBNZWRlaXJvc1xuICAgICAqIEBjb25zdHJ1Y3RvclxuICAgICAqL1xuICAgIGZ1bmN0aW9uIFNpZ25hbCgpIHtcbiAgICAgICAgLyoqXG4gICAgICAgICAqIEB0eXBlIEFycmF5LjxTaWduYWxCaW5kaW5nPlxuICAgICAgICAgKiBAcHJpdmF0ZVxuICAgICAgICAgKi9cbiAgICAgICAgdGhpcy5fYmluZGluZ3MgPSBbXTtcbiAgICAgICAgdGhpcy5fcHJldlBhcmFtcyA9IG51bGw7XG5cbiAgICAgICAgLy8gZW5mb3JjZSBkaXNwYXRjaCB0byBhd2F5cyB3b3JrIG9uIHNhbWUgY29udGV4dCAoIzQ3KVxuICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgIHRoaXMuZGlzcGF0Y2ggPSBmdW5jdGlvbigpe1xuICAgICAgICAgICAgU2lnbmFsLnByb3RvdHlwZS5kaXNwYXRjaC5hcHBseShzZWxmLCBhcmd1bWVudHMpO1xuICAgICAgICB9O1xuICAgIH1cblxuICAgIFNpZ25hbC5wcm90b3R5cGUgPSB7XG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIFNpZ25hbHMgVmVyc2lvbiBOdW1iZXJcbiAgICAgICAgICogQHR5cGUgU3RyaW5nXG4gICAgICAgICAqIEBjb25zdFxuICAgICAgICAgKi9cbiAgICAgICAgVkVSU0lPTiA6ICcxLjAuMCcsXG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIElmIFNpZ25hbCBzaG91bGQga2VlcCByZWNvcmQgb2YgcHJldmlvdXNseSBkaXNwYXRjaGVkIHBhcmFtZXRlcnMgYW5kXG4gICAgICAgICAqIGF1dG9tYXRpY2FsbHkgZXhlY3V0ZSBsaXN0ZW5lciBkdXJpbmcgYGFkZCgpYC9gYWRkT25jZSgpYCBpZiBTaWduYWwgd2FzXG4gICAgICAgICAqIGFscmVhZHkgZGlzcGF0Y2hlZCBiZWZvcmUuXG4gICAgICAgICAqIEB0eXBlIGJvb2xlYW5cbiAgICAgICAgICovXG4gICAgICAgIG1lbW9yaXplIDogZmFsc2UsXG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIEB0eXBlIGJvb2xlYW5cbiAgICAgICAgICogQHByaXZhdGVcbiAgICAgICAgICovXG4gICAgICAgIF9zaG91bGRQcm9wYWdhdGUgOiB0cnVlLFxuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBJZiBTaWduYWwgaXMgYWN0aXZlIGFuZCBzaG91bGQgYnJvYWRjYXN0IGV2ZW50cy5cbiAgICAgICAgICogPHA+PHN0cm9uZz5JTVBPUlRBTlQ6PC9zdHJvbmc+IFNldHRpbmcgdGhpcyBwcm9wZXJ0eSBkdXJpbmcgYSBkaXNwYXRjaCB3aWxsIG9ubHkgYWZmZWN0IHRoZSBuZXh0IGRpc3BhdGNoLCBpZiB5b3Ugd2FudCB0byBzdG9wIHRoZSBwcm9wYWdhdGlvbiBvZiBhIHNpZ25hbCB1c2UgYGhhbHQoKWAgaW5zdGVhZC48L3A+XG4gICAgICAgICAqIEB0eXBlIGJvb2xlYW5cbiAgICAgICAgICovXG4gICAgICAgIGFjdGl2ZSA6IHRydWUsXG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIEBwYXJhbSB7RnVuY3Rpb259IGxpc3RlbmVyXG4gICAgICAgICAqIEBwYXJhbSB7Ym9vbGVhbn0gaXNPbmNlXG4gICAgICAgICAqIEBwYXJhbSB7T2JqZWN0fSBbbGlzdGVuZXJDb250ZXh0XVxuICAgICAgICAgKiBAcGFyYW0ge051bWJlcn0gW3ByaW9yaXR5XVxuICAgICAgICAgKiBAcmV0dXJuIHtTaWduYWxCaW5kaW5nfVxuICAgICAgICAgKiBAcHJpdmF0ZVxuICAgICAgICAgKi9cbiAgICAgICAgX3JlZ2lzdGVyTGlzdGVuZXIgOiBmdW5jdGlvbiAobGlzdGVuZXIsIGlzT25jZSwgbGlzdGVuZXJDb250ZXh0LCBwcmlvcml0eSkge1xuXG4gICAgICAgICAgICB2YXIgcHJldkluZGV4ID0gdGhpcy5faW5kZXhPZkxpc3RlbmVyKGxpc3RlbmVyLCBsaXN0ZW5lckNvbnRleHQpLFxuICAgICAgICAgICAgICAgIGJpbmRpbmc7XG5cbiAgICAgICAgICAgIGlmIChwcmV2SW5kZXggIT09IC0xKSB7XG4gICAgICAgICAgICAgICAgYmluZGluZyA9IHRoaXMuX2JpbmRpbmdzW3ByZXZJbmRleF07XG4gICAgICAgICAgICAgICAgaWYgKGJpbmRpbmcuaXNPbmNlKCkgIT09IGlzT25jZSkge1xuICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ1lvdSBjYW5ub3QgYWRkJysgKGlzT25jZT8gJycgOiAnT25jZScpICsnKCkgdGhlbiBhZGQnKyAoIWlzT25jZT8gJycgOiAnT25jZScpICsnKCkgdGhlIHNhbWUgbGlzdGVuZXIgd2l0aG91dCByZW1vdmluZyB0aGUgcmVsYXRpb25zaGlwIGZpcnN0LicpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgYmluZGluZyA9IG5ldyBTaWduYWxCaW5kaW5nKHRoaXMsIGxpc3RlbmVyLCBpc09uY2UsIGxpc3RlbmVyQ29udGV4dCwgcHJpb3JpdHkpO1xuICAgICAgICAgICAgICAgIHRoaXMuX2FkZEJpbmRpbmcoYmluZGluZyk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmKHRoaXMubWVtb3JpemUgJiYgdGhpcy5fcHJldlBhcmFtcyl7XG4gICAgICAgICAgICAgICAgYmluZGluZy5leGVjdXRlKHRoaXMuX3ByZXZQYXJhbXMpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4gYmluZGluZztcbiAgICAgICAgfSxcblxuICAgICAgICAvKipcbiAgICAgICAgICogQHBhcmFtIHtTaWduYWxCaW5kaW5nfSBiaW5kaW5nXG4gICAgICAgICAqIEBwcml2YXRlXG4gICAgICAgICAqL1xuICAgICAgICBfYWRkQmluZGluZyA6IGZ1bmN0aW9uIChiaW5kaW5nKSB7XG4gICAgICAgICAgICAvL3NpbXBsaWZpZWQgaW5zZXJ0aW9uIHNvcnRcbiAgICAgICAgICAgIHZhciBuID0gdGhpcy5fYmluZGluZ3MubGVuZ3RoO1xuICAgICAgICAgICAgZG8geyAtLW47IH0gd2hpbGUgKHRoaXMuX2JpbmRpbmdzW25dICYmIGJpbmRpbmcuX3ByaW9yaXR5IDw9IHRoaXMuX2JpbmRpbmdzW25dLl9wcmlvcml0eSk7XG4gICAgICAgICAgICB0aGlzLl9iaW5kaW5ncy5zcGxpY2UobiArIDEsIDAsIGJpbmRpbmcpO1xuICAgICAgICB9LFxuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBAcGFyYW0ge0Z1bmN0aW9ufSBsaXN0ZW5lclxuICAgICAgICAgKiBAcmV0dXJuIHtudW1iZXJ9XG4gICAgICAgICAqIEBwcml2YXRlXG4gICAgICAgICAqL1xuICAgICAgICBfaW5kZXhPZkxpc3RlbmVyIDogZnVuY3Rpb24gKGxpc3RlbmVyLCBjb250ZXh0KSB7XG4gICAgICAgICAgICB2YXIgbiA9IHRoaXMuX2JpbmRpbmdzLmxlbmd0aCxcbiAgICAgICAgICAgICAgICBjdXI7XG4gICAgICAgICAgICB3aGlsZSAobi0tKSB7XG4gICAgICAgICAgICAgICAgY3VyID0gdGhpcy5fYmluZGluZ3Nbbl07XG4gICAgICAgICAgICAgICAgaWYgKGN1ci5fbGlzdGVuZXIgPT09IGxpc3RlbmVyICYmIGN1ci5jb250ZXh0ID09PSBjb250ZXh0KSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBuO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiAtMTtcbiAgICAgICAgfSxcblxuICAgICAgICAvKipcbiAgICAgICAgICogQ2hlY2sgaWYgbGlzdGVuZXIgd2FzIGF0dGFjaGVkIHRvIFNpZ25hbC5cbiAgICAgICAgICogQHBhcmFtIHtGdW5jdGlvbn0gbGlzdGVuZXJcbiAgICAgICAgICogQHBhcmFtIHtPYmplY3R9IFtjb250ZXh0XVxuICAgICAgICAgKiBAcmV0dXJuIHtib29sZWFufSBpZiBTaWduYWwgaGFzIHRoZSBzcGVjaWZpZWQgbGlzdGVuZXIuXG4gICAgICAgICAqL1xuICAgICAgICBoYXMgOiBmdW5jdGlvbiAobGlzdGVuZXIsIGNvbnRleHQpIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl9pbmRleE9mTGlzdGVuZXIobGlzdGVuZXIsIGNvbnRleHQpICE9PSAtMTtcbiAgICAgICAgfSxcblxuICAgICAgICAvKipcbiAgICAgICAgICogQWRkIGEgbGlzdGVuZXIgdG8gdGhlIHNpZ25hbC5cbiAgICAgICAgICogQHBhcmFtIHtGdW5jdGlvbn0gbGlzdGVuZXIgU2lnbmFsIGhhbmRsZXIgZnVuY3Rpb24uXG4gICAgICAgICAqIEBwYXJhbSB7T2JqZWN0fSBbbGlzdGVuZXJDb250ZXh0XSBDb250ZXh0IG9uIHdoaWNoIGxpc3RlbmVyIHdpbGwgYmUgZXhlY3V0ZWQgKG9iamVjdCB0aGF0IHNob3VsZCByZXByZXNlbnQgdGhlIGB0aGlzYCB2YXJpYWJsZSBpbnNpZGUgbGlzdGVuZXIgZnVuY3Rpb24pLlxuICAgICAgICAgKiBAcGFyYW0ge051bWJlcn0gW3ByaW9yaXR5XSBUaGUgcHJpb3JpdHkgbGV2ZWwgb2YgdGhlIGV2ZW50IGxpc3RlbmVyLiBMaXN0ZW5lcnMgd2l0aCBoaWdoZXIgcHJpb3JpdHkgd2lsbCBiZSBleGVjdXRlZCBiZWZvcmUgbGlzdGVuZXJzIHdpdGggbG93ZXIgcHJpb3JpdHkuIExpc3RlbmVycyB3aXRoIHNhbWUgcHJpb3JpdHkgbGV2ZWwgd2lsbCBiZSBleGVjdXRlZCBhdCB0aGUgc2FtZSBvcmRlciBhcyB0aGV5IHdlcmUgYWRkZWQuIChkZWZhdWx0ID0gMClcbiAgICAgICAgICogQHJldHVybiB7U2lnbmFsQmluZGluZ30gQW4gT2JqZWN0IHJlcHJlc2VudGluZyB0aGUgYmluZGluZyBiZXR3ZWVuIHRoZSBTaWduYWwgYW5kIGxpc3RlbmVyLlxuICAgICAgICAgKi9cbiAgICAgICAgYWRkIDogZnVuY3Rpb24gKGxpc3RlbmVyLCBsaXN0ZW5lckNvbnRleHQsIHByaW9yaXR5KSB7XG4gICAgICAgICAgICB2YWxpZGF0ZUxpc3RlbmVyKGxpc3RlbmVyLCAnYWRkJyk7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5fcmVnaXN0ZXJMaXN0ZW5lcihsaXN0ZW5lciwgZmFsc2UsIGxpc3RlbmVyQ29udGV4dCwgcHJpb3JpdHkpO1xuICAgICAgICB9LFxuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBBZGQgbGlzdGVuZXIgdG8gdGhlIHNpZ25hbCB0aGF0IHNob3VsZCBiZSByZW1vdmVkIGFmdGVyIGZpcnN0IGV4ZWN1dGlvbiAod2lsbCBiZSBleGVjdXRlZCBvbmx5IG9uY2UpLlxuICAgICAgICAgKiBAcGFyYW0ge0Z1bmN0aW9ufSBsaXN0ZW5lciBTaWduYWwgaGFuZGxlciBmdW5jdGlvbi5cbiAgICAgICAgICogQHBhcmFtIHtPYmplY3R9IFtsaXN0ZW5lckNvbnRleHRdIENvbnRleHQgb24gd2hpY2ggbGlzdGVuZXIgd2lsbCBiZSBleGVjdXRlZCAob2JqZWN0IHRoYXQgc2hvdWxkIHJlcHJlc2VudCB0aGUgYHRoaXNgIHZhcmlhYmxlIGluc2lkZSBsaXN0ZW5lciBmdW5jdGlvbikuXG4gICAgICAgICAqIEBwYXJhbSB7TnVtYmVyfSBbcHJpb3JpdHldIFRoZSBwcmlvcml0eSBsZXZlbCBvZiB0aGUgZXZlbnQgbGlzdGVuZXIuIExpc3RlbmVycyB3aXRoIGhpZ2hlciBwcmlvcml0eSB3aWxsIGJlIGV4ZWN1dGVkIGJlZm9yZSBsaXN0ZW5lcnMgd2l0aCBsb3dlciBwcmlvcml0eS4gTGlzdGVuZXJzIHdpdGggc2FtZSBwcmlvcml0eSBsZXZlbCB3aWxsIGJlIGV4ZWN1dGVkIGF0IHRoZSBzYW1lIG9yZGVyIGFzIHRoZXkgd2VyZSBhZGRlZC4gKGRlZmF1bHQgPSAwKVxuICAgICAgICAgKiBAcmV0dXJuIHtTaWduYWxCaW5kaW5nfSBBbiBPYmplY3QgcmVwcmVzZW50aW5nIHRoZSBiaW5kaW5nIGJldHdlZW4gdGhlIFNpZ25hbCBhbmQgbGlzdGVuZXIuXG4gICAgICAgICAqL1xuICAgICAgICBhZGRPbmNlIDogZnVuY3Rpb24gKGxpc3RlbmVyLCBsaXN0ZW5lckNvbnRleHQsIHByaW9yaXR5KSB7XG4gICAgICAgICAgICB2YWxpZGF0ZUxpc3RlbmVyKGxpc3RlbmVyLCAnYWRkT25jZScpO1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuX3JlZ2lzdGVyTGlzdGVuZXIobGlzdGVuZXIsIHRydWUsIGxpc3RlbmVyQ29udGV4dCwgcHJpb3JpdHkpO1xuICAgICAgICB9LFxuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBSZW1vdmUgYSBzaW5nbGUgbGlzdGVuZXIgZnJvbSB0aGUgZGlzcGF0Y2ggcXVldWUuXG4gICAgICAgICAqIEBwYXJhbSB7RnVuY3Rpb259IGxpc3RlbmVyIEhhbmRsZXIgZnVuY3Rpb24gdGhhdCBzaG91bGQgYmUgcmVtb3ZlZC5cbiAgICAgICAgICogQHBhcmFtIHtPYmplY3R9IFtjb250ZXh0XSBFeGVjdXRpb24gY29udGV4dCAoc2luY2UgeW91IGNhbiBhZGQgdGhlIHNhbWUgaGFuZGxlciBtdWx0aXBsZSB0aW1lcyBpZiBleGVjdXRpbmcgaW4gYSBkaWZmZXJlbnQgY29udGV4dCkuXG4gICAgICAgICAqIEByZXR1cm4ge0Z1bmN0aW9ufSBMaXN0ZW5lciBoYW5kbGVyIGZ1bmN0aW9uLlxuICAgICAgICAgKi9cbiAgICAgICAgcmVtb3ZlIDogZnVuY3Rpb24gKGxpc3RlbmVyLCBjb250ZXh0KSB7XG4gICAgICAgICAgICB2YWxpZGF0ZUxpc3RlbmVyKGxpc3RlbmVyLCAncmVtb3ZlJyk7XG5cbiAgICAgICAgICAgIHZhciBpID0gdGhpcy5faW5kZXhPZkxpc3RlbmVyKGxpc3RlbmVyLCBjb250ZXh0KTtcbiAgICAgICAgICAgIGlmIChpICE9PSAtMSkge1xuICAgICAgICAgICAgICAgIHRoaXMuX2JpbmRpbmdzW2ldLl9kZXN0cm95KCk7IC8vbm8gcmVhc29uIHRvIGEgU2lnbmFsQmluZGluZyBleGlzdCBpZiBpdCBpc24ndCBhdHRhY2hlZCB0byBhIHNpZ25hbFxuICAgICAgICAgICAgICAgIHRoaXMuX2JpbmRpbmdzLnNwbGljZShpLCAxKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBsaXN0ZW5lcjtcbiAgICAgICAgfSxcblxuICAgICAgICAvKipcbiAgICAgICAgICogUmVtb3ZlIGFsbCBsaXN0ZW5lcnMgZnJvbSB0aGUgU2lnbmFsLlxuICAgICAgICAgKi9cbiAgICAgICAgcmVtb3ZlQWxsIDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgdmFyIG4gPSB0aGlzLl9iaW5kaW5ncy5sZW5ndGg7XG4gICAgICAgICAgICB3aGlsZSAobi0tKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5fYmluZGluZ3Nbbl0uX2Rlc3Ryb3koKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoaXMuX2JpbmRpbmdzLmxlbmd0aCA9IDA7XG4gICAgICAgIH0sXG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIEByZXR1cm4ge251bWJlcn0gTnVtYmVyIG9mIGxpc3RlbmVycyBhdHRhY2hlZCB0byB0aGUgU2lnbmFsLlxuICAgICAgICAgKi9cbiAgICAgICAgZ2V0TnVtTGlzdGVuZXJzIDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuX2JpbmRpbmdzLmxlbmd0aDtcbiAgICAgICAgfSxcblxuICAgICAgICAvKipcbiAgICAgICAgICogU3RvcCBwcm9wYWdhdGlvbiBvZiB0aGUgZXZlbnQsIGJsb2NraW5nIHRoZSBkaXNwYXRjaCB0byBuZXh0IGxpc3RlbmVycyBvbiB0aGUgcXVldWUuXG4gICAgICAgICAqIDxwPjxzdHJvbmc+SU1QT1JUQU5UOjwvc3Ryb25nPiBzaG91bGQgYmUgY2FsbGVkIG9ubHkgZHVyaW5nIHNpZ25hbCBkaXNwYXRjaCwgY2FsbGluZyBpdCBiZWZvcmUvYWZ0ZXIgZGlzcGF0Y2ggd29uJ3QgYWZmZWN0IHNpZ25hbCBicm9hZGNhc3QuPC9wPlxuICAgICAgICAgKiBAc2VlIFNpZ25hbC5wcm90b3R5cGUuZGlzYWJsZVxuICAgICAgICAgKi9cbiAgICAgICAgaGFsdCA6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHRoaXMuX3Nob3VsZFByb3BhZ2F0ZSA9IGZhbHNlO1xuICAgICAgICB9LFxuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBEaXNwYXRjaC9Ccm9hZGNhc3QgU2lnbmFsIHRvIGFsbCBsaXN0ZW5lcnMgYWRkZWQgdG8gdGhlIHF1ZXVlLlxuICAgICAgICAgKiBAcGFyYW0gey4uLip9IFtwYXJhbXNdIFBhcmFtZXRlcnMgdGhhdCBzaG91bGQgYmUgcGFzc2VkIHRvIGVhY2ggaGFuZGxlci5cbiAgICAgICAgICovXG4gICAgICAgIGRpc3BhdGNoIDogZnVuY3Rpb24gKHBhcmFtcykge1xuICAgICAgICAgICAgaWYgKCEgdGhpcy5hY3RpdmUpIHtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHZhciBwYXJhbXNBcnIgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMpLFxuICAgICAgICAgICAgICAgIG4gPSB0aGlzLl9iaW5kaW5ncy5sZW5ndGgsXG4gICAgICAgICAgICAgICAgYmluZGluZ3M7XG5cbiAgICAgICAgICAgIGlmICh0aGlzLm1lbW9yaXplKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5fcHJldlBhcmFtcyA9IHBhcmFtc0FycjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKCEgbikge1xuICAgICAgICAgICAgICAgIC8vc2hvdWxkIGNvbWUgYWZ0ZXIgbWVtb3JpemVcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGJpbmRpbmdzID0gdGhpcy5fYmluZGluZ3Muc2xpY2UoKTsgLy9jbG9uZSBhcnJheSBpbiBjYXNlIGFkZC9yZW1vdmUgaXRlbXMgZHVyaW5nIGRpc3BhdGNoXG4gICAgICAgICAgICB0aGlzLl9zaG91bGRQcm9wYWdhdGUgPSB0cnVlOyAvL2luIGNhc2UgYGhhbHRgIHdhcyBjYWxsZWQgYmVmb3JlIGRpc3BhdGNoIG9yIGR1cmluZyB0aGUgcHJldmlvdXMgZGlzcGF0Y2guXG5cbiAgICAgICAgICAgIC8vZXhlY3V0ZSBhbGwgY2FsbGJhY2tzIHVudGlsIGVuZCBvZiB0aGUgbGlzdCBvciB1bnRpbCBhIGNhbGxiYWNrIHJldHVybnMgYGZhbHNlYCBvciBzdG9wcyBwcm9wYWdhdGlvblxuICAgICAgICAgICAgLy9yZXZlcnNlIGxvb3Agc2luY2UgbGlzdGVuZXJzIHdpdGggaGlnaGVyIHByaW9yaXR5IHdpbGwgYmUgYWRkZWQgYXQgdGhlIGVuZCBvZiB0aGUgbGlzdFxuICAgICAgICAgICAgZG8geyBuLS07IH0gd2hpbGUgKGJpbmRpbmdzW25dICYmIHRoaXMuX3Nob3VsZFByb3BhZ2F0ZSAmJiBiaW5kaW5nc1tuXS5leGVjdXRlKHBhcmFtc0FycikgIT09IGZhbHNlKTtcbiAgICAgICAgfSxcblxuICAgICAgICAvKipcbiAgICAgICAgICogRm9yZ2V0IG1lbW9yaXplZCBhcmd1bWVudHMuXG4gICAgICAgICAqIEBzZWUgU2lnbmFsLm1lbW9yaXplXG4gICAgICAgICAqL1xuICAgICAgICBmb3JnZXQgOiBmdW5jdGlvbigpe1xuICAgICAgICAgICAgdGhpcy5fcHJldlBhcmFtcyA9IG51bGw7XG4gICAgICAgIH0sXG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIFJlbW92ZSBhbGwgYmluZGluZ3MgZnJvbSBzaWduYWwgYW5kIGRlc3Ryb3kgYW55IHJlZmVyZW5jZSB0byBleHRlcm5hbCBvYmplY3RzIChkZXN0cm95IFNpZ25hbCBvYmplY3QpLlxuICAgICAgICAgKiA8cD48c3Ryb25nPklNUE9SVEFOVDo8L3N0cm9uZz4gY2FsbGluZyBhbnkgbWV0aG9kIG9uIHRoZSBzaWduYWwgaW5zdGFuY2UgYWZ0ZXIgY2FsbGluZyBkaXNwb3NlIHdpbGwgdGhyb3cgZXJyb3JzLjwvcD5cbiAgICAgICAgICovXG4gICAgICAgIGRpc3Bvc2UgOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICB0aGlzLnJlbW92ZUFsbCgpO1xuICAgICAgICAgICAgZGVsZXRlIHRoaXMuX2JpbmRpbmdzO1xuICAgICAgICAgICAgZGVsZXRlIHRoaXMuX3ByZXZQYXJhbXM7XG4gICAgICAgIH0sXG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIEByZXR1cm4ge3N0cmluZ30gU3RyaW5nIHJlcHJlc2VudGF0aW9uIG9mIHRoZSBvYmplY3QuXG4gICAgICAgICAqL1xuICAgICAgICB0b1N0cmluZyA6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHJldHVybiAnW1NpZ25hbCBhY3RpdmU6JysgdGhpcy5hY3RpdmUgKycgbnVtTGlzdGVuZXJzOicrIHRoaXMuZ2V0TnVtTGlzdGVuZXJzKCkgKyddJztcbiAgICAgICAgfVxuXG4gICAgfTtcblxuXG4gICAgLy8gTmFtZXNwYWNlIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgLy89PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbiAgICAvKipcbiAgICAgKiBTaWduYWxzIG5hbWVzcGFjZVxuICAgICAqIEBuYW1lc3BhY2VcbiAgICAgKiBAbmFtZSBzaWduYWxzXG4gICAgICovXG4gICAgdmFyIHNpZ25hbHMgPSBTaWduYWw7XG5cbiAgICAvKipcbiAgICAgKiBDdXN0b20gZXZlbnQgYnJvYWRjYXN0ZXJcbiAgICAgKiBAc2VlIFNpZ25hbFxuICAgICAqL1xuICAgIC8vIGFsaWFzIGZvciBiYWNrd2FyZHMgY29tcGF0aWJpbGl0eSAoc2VlICNnaC00NClcbiAgICBzaWduYWxzLlNpZ25hbCA9IFNpZ25hbDtcblxuXG5cbiAgICAvL2V4cG9ydHMgdG8gbXVsdGlwbGUgZW52aXJvbm1lbnRzXG4gICAgaWYodHlwZW9mIGRlZmluZSA9PT0gJ2Z1bmN0aW9uJyAmJiBkZWZpbmUuYW1kKXsgLy9BTURcbiAgICAgICAgZGVmaW5lKGZ1bmN0aW9uICgpIHsgcmV0dXJuIHNpZ25hbHM7IH0pO1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIG1vZHVsZSAhPT0gJ3VuZGVmaW5lZCcgJiYgbW9kdWxlLmV4cG9ydHMpeyAvL25vZGVcbiAgICAgICAgbW9kdWxlLmV4cG9ydHMgPSBzaWduYWxzO1xuICAgIH0gZWxzZSB7IC8vYnJvd3NlclxuICAgICAgICAvL3VzZSBzdHJpbmcgYmVjYXVzZSBvZiBHb29nbGUgY2xvc3VyZSBjb21waWxlciBBRFZBTkNFRF9NT0RFXG4gICAgICAgIC8qanNsaW50IHN1Yjp0cnVlICovXG4gICAgICAgIGdsb2JhbFsnc2lnbmFscyddID0gc2lnbmFscztcbiAgICB9XG5cbn0odGhpcykpO1xuIiwiLyoqXG4gKiBSdW4gYSBzdGVwIG9mIG1vZGlmeWluZyBhIG5vZGUgZ3JhcGguIFRoaXMgdGFrZXMgYSBKU09OIHN0cnVjdHVyZSBhcyBjYW5cbiAqIGJlIHNlZW4gaW4gdGhlIHNyYy9hY3Rpb25zIGZvbGRlciB0aGF0IHRoZW4gZGVmaW5lcyBob3cgdG8gbW9kaWZ5IHRoZSBub2RlXG4gKiBncmFwaC5cbiAqL1xuXG5jb25zdCBOT0RFX1NQUkVBRCA9IDAuMDFcblxuZXhwb3J0cy5hZGROb2RlID0gZnVuY3Rpb24gKHtlbCwgbm9kZXMsIGxpbmtzfSwgbm9kZSkge1xuICAvLyBBbGxvdyBub2RlcyB0byBiZSByZW5hbWVkIGxhdGVyIG9uLCBidXQgYWx3YXlzIHJldmVydCB3aGVuIHJlLWFkZGluZy5cbiAgaWYobm9kZS5yZW5hbWUpIHtcbiAgICBub2RlLnJlbmFtZSA9IFwiXCJcbiAgfVxuXG4gIGlmKG5vZGVzLmZpbmQoKHtpZH0pID0+IGlkID09PSBub2RlKSkge1xuICAgIHRocm93IG5ldyBFcnJvcignQSBub2RlIGFscmVhZHkgZXhpc3RzIHdpdGggdGhhdCBpZCcpXG4gIH1cblxuICAvLyBOb2RlcyB0ZW5kIHRvIGJlIGZ1bmt5IHdpdGggdGhlIGZvcmNlIGxheW91dCB3aGVuIGluY3JlbWVudGFsbHkgYWRkZWQuXG4gIC8vIFBsYWNlIHRoZW0gbmVhciB0aGUgY2VudGVyIHJhbmRvbWx5IHRvIGFpZCBpbiB0aGUgbGF5b3V0IG9uIHRoZSBzY3JlZW4uXG4gIGlmKG5vZGUueCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgY29uc3QgdyA9IGVsLm9mZnNldFdpZHRoXG4gICAgY29uc3QgaCA9IGVsLm9mZnNldEhlaWdodCAvIDJcbiAgICBub2RlLnggPSB3IC8gMiArIChNYXRoLnJhbmRvbSgpICogdyAtIHcgLyAyKSAqIE5PREVfU1BSRUFEXG4gICAgbm9kZS55ID0gaCAvIDIgKyAoTWF0aC5yYW5kb20oKSAqIGggLSBoIC8gMikgKiBOT0RFX1NQUkVBRFxuICB9XG4gIG5vZGVzLnB1c2gobm9kZSlcbn0sXG5cbmV4cG9ydHMucmVuYW1lID0gZnVuY3Rpb24gKHtub2RlcywgbGlua3N9LCBbaWQsIHZhbHVlXSkge1xuICBjb25zdCBub2RlID0gbm9kZXMuZmluZChuID0+IG4uaWQgPT09IGlkKVxuICBpZiAoIW5vZGUpIHRocm93IG5ldyBFcnJvcihcIkNvdWxkIG5vdCBmaW5kIHRoYXQgbm9kZSB0byByZW1vdmUuXCIpXG4gIG5vZGUucmVuYW1lID0gdmFsdWVcbn0sXG5cbmV4cG9ydHMuYWRkTGluayA9IGZ1bmN0aW9uICh7bm9kZXMsIGxpbmtzfSwgbGluaykge1xuICBjb25zdCB7c291cmNlLCB0YXJnZXQsIGRpc3BsYXksIGRhc2hlZH0gPSBsaW5rO1xuICBjb25zdCBzb3VyY2VOb2RlID0gdHlwZW9mIHNvdXJjZSA9PT0gJ29iamVjdCdcbiAgICA/IHNvdXJjZVxuICAgIDogbm9kZXMuZmluZCgoe2lkfSkgPT4gaWQgPT09IHNvdXJjZSlcbiAgY29uc3QgdGFyZ2V0Tm9kZSA9IHR5cGVvZiBzb3VyY2UgPT09ICdvYmplY3QnXG4gICAgPyB0YXJnZXRcbiAgICA6IG5vZGVzLmZpbmQoKHtpZH0pID0+IGlkID09PSB0YXJnZXQpXG4gIGlmKCFzb3VyY2VOb2RlIHx8ICF0YXJnZXROb2RlKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKGBDb3VsZCBub3QgZmluZCB0aG9zZSBub2RlcyB0byBsaW5rLiBcIiR7c291cmNlfVwiIHRvIFwiJHt0YXJnZXR9XCJgKVxuICB9XG4gIGxpbmsuc291cmNlID0gc291cmNlTm9kZVxuICBsaW5rLnRhcmdldCA9IHRhcmdldE5vZGVcbiAgaWYobGluay5yZW5hbWUpIGxpbmsucmVuYW1lID0gXCJcIlxuICBsaW5rcy5wdXNoKGxpbmspXG59LFxuXG5leHBvcnRzLnJlbW92ZU5vZGUgPSBmdW5jdGlvbiAoe25vZGVzLCBsaW5rc30sIGlkKSB7XG4gIGNvbnN0IG5vZGUgPSBub2Rlcy5maW5kKG4gPT4gbi5pZCA9PT0gaWQpXG4gIGlmICghbm9kZSkgdGhyb3cgbmV3IEVycm9yKFwiQ291bGQgbm90IGZpbmQgdGhhdCBub2RlIHRvIHJlbW92ZS5cIilcbiAgbm9kZXMuc3BsaWNlKG5vZGVzLmluZGV4T2Yobm9kZSksIDEpXG5cbiAgY29uc3Qgc291cmNlcyA9IGxpbmtzLmZpbHRlcigoe3NvdXJjZX0pID0+IHNvdXJjZS5pZCA9PT0gaWQpXG4gIHNvdXJjZXMuZm9yRWFjaChzb3VyY2UgPT4gbGlua3Muc3BsaWNlKGxpbmtzLmluZGV4T2Yoc291cmNlKSwgMSkpXG5cbiAgY29uc3QgdGFyZ2V0cyA9IGxpbmtzLmZpbHRlcigoe18sIHRhcmdldH0pID0+IHRhcmdldC5pZCA9PT0gaWQpXG4gIHRhcmdldHMuZm9yRWFjaCh0YXJnZXQgPT4gbGlua3Muc3BsaWNlKGxpbmtzLmluZGV4T2YodGFyZ2V0KSwgMSkpXG59LFxuXG5leHBvcnRzLnJlbW92ZUxpbmsgPSBmdW5jdGlvbiAoe25vZGVzLCBsaW5rc30sIFtzb3VyY2VJZCwgdGFyZ2V0SWRdKSB7XG4gIGNvbnN0IGxpbmsgPSBsaW5rcy5maW5kKCh7c291cmNlLCB0YXJnZXR9KSA9PiB7XG4gICAgcmV0dXJuIHNvdXJjZS5pZCA9PT0gc291cmNlSWQgJiYgdGFyZ2V0LmlkID09PSB0YXJnZXRJZFxuICB9KVxuICBpZiAoIWxpbmspIHRocm93IG5ldyBFcnJvcihcIkNvdWxkIG5vdCBmaW5kIHRoYXQgbGluayB0byByZW1vdmUuXCIpXG4gIGxpbmtzLnNwbGljZShsaW5rcy5pbmRleE9mKGxpbmspLCAxKVxufVxuXG5leHBvcnRzLnJlbmFtZUxpbmsgPSBmdW5jdGlvbiAoe25vZGVzLCBsaW5rc30sIHtzb3VyY2UsIHRhcmdldCwgZGlzcGxheX0pIHtcbiAgY29uc3QgbGluayA9IGxpbmtzLmZpbmQoKGIpID0+IHtcbiAgICByZXR1cm4gYi5zb3VyY2UuaWQgPT09IHNvdXJjZSAmJiBiLnRhcmdldC5pZCA9PT0gdGFyZ2V0XG4gIH0pXG4gIGlmICghbGluaykgdGhyb3cgbmV3IEVycm9yKFwiQ291bGQgbm90IGZpbmQgdGhhdCBsaW5rIHRvIHJlbW92ZS5cIilcbiAgbGluay5yZW5hbWUgPSBkaXNwbGF5XG59XG5cblxuZXhwb3J0cy5oaWdobGlnaHQgPSBmdW5jdGlvbiAoe2VkaXRvcn0sIHZhbHVlKSB7XG5cbiAgbGV0IFtzdGFydCwgZW5kXSA9IEFycmF5LmlzQXJyYXkodmFsdWUpID8gdmFsdWUgOiBbdmFsdWUsIHZhbHVlXVxuICBsZXQgW3N0YXJ0TGluZSwgc3RhcnRDaF0gPSBTdHJpbmcoc3RhcnQpLnNwbGl0KCc6JylcbiAgbGV0IFtlbmRMaW5lLCBlbmRDaF0gPSBTdHJpbmcoZW5kKS5zcGxpdCgnOicpXG5cbiAgaWYoIWVuZENoKSB7XG4gICAgZW5kTGluZSsrXG4gIH1cbiAgc3RhcnRDaCA9IE1hdGgubWF4KDAsIHN0YXJ0Q2gtMSlcbiAgZW5kQ2ggPSBNYXRoLm1heCgwLCBlbmRDaC0xKVxuXG4gIGVkaXRvci5tYXJrVGV4dChcbiAgICB7bGluZTogc3RhcnRMaW5lIC0gMSwgY2g6IHN0YXJ0Q2ggfHwgMH0sXG4gICAge2xpbmU6IGVuZExpbmUgLSAxLCBjaDogZW5kQ2ggfHwgMH0sXG4gICAge1xuICAgICAgY2xhc3NOYW1lOiBcImhpZ2hsaWdodGVkLWxpbmVcIlxuICAgIH1cbiAgKVxufVxuIiwiZXhwb3J0cy5jb2RlID0gYGZ1bmN0aW9uIHNheVNvbWV0aGluZygpIHtcbiAgdmFyIG1lc3NhZ2UgPSBcIkx1a2UsIEkgYW0geW91ciBmYXRoZXIuXCI7XG4gIGNvbnNvbGUubG9nKG1lc3NhZ2UpO1xufVxuXG5mdW5jdGlvbiB3aGlzcGVyU29tZXRoaW5nKCkge1xuICBtZXNzYWdlID0gXCJJIHNlZSBkZWFkIHBlb3BsZS5cIjtcbiAgY29uc29sZS5sb2cobWVzc2FnZSk7XG59XG5cbmZ1bmN0aW9uIHNob3V0U29tZXRoaW5nKCkge1xuICB0aGlzLm1lc3NhZ2UgPSBcIkkgc291bmQgbXkgYmFyYmFyaWMgeWF3cC5cIjtcbiAgY29uc29sZS5sb2codGhpcy5tZXNzYWdlKTtcbn1cblxuc2F5U29tZXRoaW5nKCk7XG53aGlzcGVyU29tZXRoaW5nKCk7XG5zaG91dFNvbWV0aGluZygpO1xuYFxuXG5leHBvcnRzLnN0ZXBzID0gW1xuICBbXG4gICAgW1wiYWRkTm9kZVwiLCB7dHlwZTogXCJ3aW5kb3dcIiwgaWQ6IFwid2luZG93XCJ9XSxcbiAgICBbXCJhZGROb2RlXCIsIHt0eXBlOiBcImNhbGxTdGFja1wiLCBpZDogXCJjYWxsU3RhY2tcIn1dLFxuICBdLFxuICBbXG4gICAgLy9zYXlTb21ldGhpbmcoKTtcbiAgICBbXCJoaWdobGlnaHRcIiwgMTZdLFxuICAgIFtcImFkZE5vZGVcIiwge3R5cGU6IFwiZnVuY3Rpb25cIiwgaWQ6IFwic2F5U29tZXRoaW5nXCIsIGRpc3BsYXk6IFwic2NvcGVcIn1dLFxuICAgIFtcImFkZExpbmtcIiwge3NvdXJjZTogXCJjYWxsU3RhY2tcIiwgdGFyZ2V0OiBcInNheVNvbWV0aGluZ1wiLCBkaXNwbGF5OiBcInNheVNvbWV0aGluZ1wifV0sXG4gIF0sXG4gIFtcbiAgICAvL3ZhciBtZXNzYWdlID0gXCJMdWtlLCBJIGFtIHlvdXIgZmF0aGVyLlwiO1xuICAgIFtcImhpZ2hsaWdodFwiLCAyXSxcbiAgICBbXCJhZGROb2RlXCIsIHt0eXBlOiBcInZhbHVlXCIsIGRpc3BsYXk6IFwiTHVrZSwgSSBhbSB5b3VyIGZhdGhlci5cIiwgaWQ6IFwibWVzc2FnZTFcIn1dLFxuICAgIFtcImFkZExpbmtcIiwge3NvdXJjZTogXCJzYXlTb21ldGhpbmdcIiwgdGFyZ2V0OiBcIm1lc3NhZ2UxXCIsIGRpc3BsYXk6IFwibWVzc2FnZVwiLCBkaXN0YW5jZTogMS41fV0sXG4gIF0sXG4gIFtcbiAgICBbXCJyZW1vdmVOb2RlXCIsIFwic2F5U29tZXRoaW5nXCJdLFxuICAgIFtcImhpZ2hsaWdodFwiLCBbMSw0XV0sXG4gIF0sXG4gIFtcbiAgICBbXCJyZW1vdmVOb2RlXCIsIFwibWVzc2FnZTFcIl0sXG4gIF0sXG4gIFtcbiAgICAvL3doaXNwZXJTb21ldGhpbmcoKTtcbiAgICBbXCJoaWdobGlnaHRcIiwgMTddLFxuICAgIFtcImFkZE5vZGVcIiwge3R5cGU6IFwiZnVuY3Rpb25cIiwgaWQ6IFwid2hpc3BlclNvbWV0aGluZ1wiLCBkaXNwbGF5OiBcInNjb3BlXCJ9XSxcbiAgICBbXCJhZGRMaW5rXCIsIHtzb3VyY2U6IFwiY2FsbFN0YWNrXCIsIHRhcmdldDogXCJ3aGlzcGVyU29tZXRoaW5nXCIsIGRpc3BsYXk6IFwid2hpc3BlclNvbWV0aGluZ1wifV0sXG4gIF0sXG4gIFtcbiAgICAvL3ZhciBtZXNzYWdlID0gXCJMdWtlLCBJIGFtIHlvdXIgZmF0aGVyLlwiO1xuICAgIFtcImhpZ2hsaWdodFwiLCA3XSxcbiAgICBbXCJhZGROb2RlXCIsIHt0eXBlOiBcInZhbHVlXCIsIGRpc3BsYXk6IFwiSSBzZWUgZGVhZCBwZW9wbGUuXCIsIGlkOiBcIm1lc3NhZ2UyXCJ9XSxcbiAgICBbXCJhZGRMaW5rXCIsIHtzb3VyY2U6IFwid2luZG93XCIsIHRhcmdldDogXCJtZXNzYWdlMlwiLCBkaXNwbGF5OiBcIm1lc3NhZ2VcIiwgZGlzdGFuY2U6IDEuNX1dLFxuICAgIFtcImFkZExpbmtcIiwge3NvdXJjZTogXCJ3aGlzcGVyU29tZXRoaW5nXCIsIHRhcmdldDogXCJtZXNzYWdlMlwiLCBkaXNwbGF5OiBcIndpbmRvdy5tZXNzYWdlXCIsIGRpc3RhbmNlOiAyLjUsIGRhc2hlZDogdHJ1ZX1dLFxuICBdLFxuICBbXG4gICAgW1wicmVtb3ZlTm9kZVwiLCBcIndoaXNwZXJTb21ldGhpbmdcIl0sXG4gICAgW1wiaGlnaGxpZ2h0XCIsIFs2LDldXSxcbiAgXSxcbiAgW1xuICAgIC8vc2hvdXRTb21ldGhpbmcoKTtcbiAgICBbXCJoaWdobGlnaHRcIiwgMThdLFxuICAgIFtcImFkZE5vZGVcIiwge3R5cGU6IFwiZnVuY3Rpb25cIiwgaWQ6IFwic2hvdXRTb21ldGhpbmdcIiwgZGlzcGxheTogXCJzY29wZVwifV0sXG4gICAgW1wiYWRkTGlua1wiLCB7c291cmNlOiBcImNhbGxTdGFja1wiLCB0YXJnZXQ6IFwic2hvdXRTb21ldGhpbmdcIiwgZGlzcGxheTogXCJzaG91dFNvbWV0aGluZ1wifV0sXG4gIF0sXG4gIFtcbiAgICAvL3ZhciBtZXNzYWdlID0gXCJMdWtlLCBJIGFtIHlvdXIgZmF0aGVyLlwiO1xuICAgIFtcImhpZ2hsaWdodFwiLCAxMl0sXG4gICAgW1wiYWRkTm9kZVwiLCB7dHlwZTogXCJ2YWx1ZVwiLCBkaXNwbGF5OiBcIkkgc291bmQgbXkgYmFyYmFyaWMgeWF3cC5cIiwgaWQ6IFwibWVzc2FnZTNcIn1dLFxuICAgIFtcImFkZExpbmtcIiwge3NvdXJjZTogXCJzaG91dFNvbWV0aGluZ1wiLCB0YXJnZXQ6IFwibWVzc2FnZTNcIiwgZGlzcGxheTogXCJ3aW5kb3cubWVzc2FnZVwiLCBkaXN0YW5jZTogMi41LCBkYXNoZWQ6IHRydWV9XSxcbiAgICBbXCJyZW1vdmVMaW5rXCIsIFtcIndpbmRvd1wiLCBcIm1lc3NhZ2UyXCJdXSxcbiAgICBbXCJhZGRMaW5rXCIsIHtzb3VyY2U6IFwid2luZG93XCIsIHRhcmdldDogXCJtZXNzYWdlM1wiLCBkaXNwbGF5OiBcIm1lc3NhZ2VcIiwgZGlzdGFuY2U6IDEuNX1dLFxuICBdLFxuICBbXG4gICAgW1wicmVtb3ZlTm9kZVwiLCBcIm1lc3NhZ2UyXCJdLFxuICBdLFxuICBbXG4gICAgW1wicmVtb3ZlTm9kZVwiLCBcInNob3V0U29tZXRoaW5nXCJdLFxuICAgIFtcImhpZ2hsaWdodFwiLCBbMTEsMTRdXSxcbiAgXSxcbiAgW1xuICBdLFxuXVxuIiwiZXhwb3J0cy5jb2RlID0gYHZhciBteU51bWJlciA9IDA7XG52YXIgbXlPYmplY3QgPSB7Zm9vOiAnYmFyJ307XG52YXIgbXlBcnJheSA9IFsnYScsJ2InLCdjJywnZCcsJ2UnXTtcblxuZnVuY3Rpb24gbXlGdW5jdGlvbigpIHtcbiAgY29uc29sZS5sb2coJ1dlbGwgdGhpcyBpcyBmdW4nKVxufVxuXG5teU51bWJlciA9IHVuZGVmaW5lZDtcbm15T2JqZWN0ID0gdW5kZWZpbmVkO1xubXlGdW5jdGlvbiA9IHVuZGVmaW5lZDtcblxuc2V0VGltZW91dChmdW5jdGlvbigpIHtcbiAgbXlBcnJheSA9IHVuZGVmaW5lZDtcbn0sIDEwMDAwKTtcbmBcblxuZXhwb3J0cy5saW5lTGVuZ3RoID0gNjBcblxuZXhwb3J0cy5zdGVwcyA9IFtcbiAgW1xuICAgIFtcImFkZE5vZGVcIiwge3R5cGU6IFwid2luZG93XCIsIGlkOiBcIndpbmRvd1wifV0sXG4gIF0sXG4gIFtcbiAgICBbXCJhZGROb2RlXCIsIHt0eXBlOiBcInZhbHVlXCIsIGlkOiBcIm15TnVtYmVyXCIsIGRpc3BsYXk6IFwiMFwifV0sXG4gICAgW1wiYWRkTGlua1wiLCB7c291cmNlOiBcIndpbmRvd1wiLCB0YXJnZXQ6IFwibXlOdW1iZXJcIiwgZGlzcGxheTogXCJteU51bWJlclwiLCBkaXN0YW5jZTogMS41fV0sXG4gICAgW1wiaGlnaGxpZ2h0XCIsIDFdLFxuICBdLFxuICBbXG4gICAgW1wiYWRkTm9kZVwiLCB7dHlwZTogXCJvYmplY3RcIiwgaWQ6IFwibXlPYmplY3RcIiwgZGlzcGxheTogXCJ7IH1cIn1dLFxuICAgIFtcImFkZExpbmtcIiwge3NvdXJjZTogXCJ3aW5kb3dcIiwgdGFyZ2V0OiBcIm15T2JqZWN0XCIsIGRpc3BsYXk6IFwibXlPYmplY3RcIn1dLFxuICAgIFtcImhpZ2hsaWdodFwiLCAyXSxcbiAgXSxcbiAgW1xuICAgIFtcImFkZE5vZGVcIiwge3R5cGU6IFwiYXJyYXlcIiwgaWQ6IFwibXlBcnJheVwiLCBkaXNwbGF5OiBcIlsgXVwifV0sXG4gICAgW1wiYWRkTm9kZVwiLCB7dHlwZTogXCJ2YWx1ZVwiLCBpZDogXCJhcnJheS1hXCIsIGRpc3BsYXk6IFwiYVwifV0sXG4gICAgW1wiYWRkTm9kZVwiLCB7dHlwZTogXCJ2YWx1ZVwiLCBpZDogXCJhcnJheS1iXCIsIGRpc3BsYXk6IFwiYlwifV0sXG4gICAgW1wiYWRkTm9kZVwiLCB7dHlwZTogXCJ2YWx1ZVwiLCBpZDogXCJhcnJheS1jXCIsIGRpc3BsYXk6IFwiY1wifV0sXG4gICAgW1wiYWRkTm9kZVwiLCB7dHlwZTogXCJ2YWx1ZVwiLCBpZDogXCJhcnJheS1kXCIsIGRpc3BsYXk6IFwiZFwifV0sXG4gICAgW1wiYWRkTm9kZVwiLCB7dHlwZTogXCJ2YWx1ZVwiLCBpZDogXCJhcnJheS1lXCIsIGRpc3BsYXk6IFwiZVwifV0sXG4gICAgW1wiYWRkTGlua1wiLCB7c291cmNlOiBcIndpbmRvd1wiLCB0YXJnZXQ6IFwibXlBcnJheVwiLCBkaXNwbGF5OiBcIm15QXJyYXlcIn1dLFxuICAgIFtcImFkZExpbmtcIiwge3NvdXJjZTogXCJteUFycmF5XCIsIHRhcmdldDogXCJhcnJheS1hXCJ9XSxcbiAgICBbXCJhZGRMaW5rXCIsIHtzb3VyY2U6IFwibXlBcnJheVwiLCB0YXJnZXQ6IFwiYXJyYXktYlwifV0sXG4gICAgW1wiYWRkTGlua1wiLCB7c291cmNlOiBcIm15QXJyYXlcIiwgdGFyZ2V0OiBcImFycmF5LWNcIn1dLFxuICAgIFtcImFkZExpbmtcIiwge3NvdXJjZTogXCJteUFycmF5XCIsIHRhcmdldDogXCJhcnJheS1kXCJ9XSxcbiAgICBbXCJhZGRMaW5rXCIsIHtzb3VyY2U6IFwibXlBcnJheVwiLCB0YXJnZXQ6IFwiYXJyYXktZVwifV0sXG4gICAgW1wiaGlnaGxpZ2h0XCIsIDNdLFxuICBdLFxuICBbXG4gICAgW1wiYWRkTm9kZVwiLCB7dHlwZTogXCJmdW5jdGlvblwiLCBpZDogXCJteUZ1bmN0aW9uXCIsIGRpc3BsYXk6IFwiZnVuY3Rpb24oKSB7fVwifV0sXG4gICAgW1wiYWRkTGlua1wiLCB7c291cmNlOiBcIndpbmRvd1wiLCB0YXJnZXQ6IFwibXlGdW5jdGlvblwiLCBkaXNwbGF5OiBcIm15RnVuY3Rpb25cIn1dLFxuICAgIFtcImhpZ2hsaWdodFwiLCBbNSw3XV0sXG4gIF0sXG4gIFtcbiAgICBbXCJyZW1vdmVMaW5rXCIsIFtcIndpbmRvd1wiLCBcIm15TnVtYmVyXCJdXSxcbiAgICBbXCJoaWdobGlnaHRcIiwgOV0sXG4gIF0sXG4gIFtcbiAgICBbXCJyZW1vdmVMaW5rXCIsIFtcIndpbmRvd1wiLCBcIm15T2JqZWN0XCJdXSxcbiAgICBbXCJoaWdobGlnaHRcIiwgMTBdLFxuICBdLFxuICBbXG4gICAgW1wicmVtb3ZlTGlua1wiLCBbXCJ3aW5kb3dcIiwgXCJteUZ1bmN0aW9uXCJdXSxcbiAgICBbXCJoaWdobGlnaHRcIiwgMTFdLFxuICBdLFxuICBbXG4gICAgW1wiaGlnaGxpZ2h0XCIsIFsxMywgMTVdXSxcbiAgXSxcbiAgW1xuICAgIFtcInJlbW92ZU5vZGVcIiwgXCJteU51bWJlclwiXSxcbiAgXSxcbiAgW1xuICAgIFtcInJlbW92ZU5vZGVcIiwgXCJteU9iamVjdFwiXSxcbiAgXSxcbiAgW1xuICAgIFtcInJlbW92ZU5vZGVcIiwgXCJteUZ1bmN0aW9uXCJdLFxuICBdLFxuICBbXG4gICAgW1wicmVtb3ZlTGlua1wiLCBbXCJ3aW5kb3dcIiwgXCJteUFycmF5XCJdXSxcbiAgICBbXCJoaWdobGlnaHRcIiwgMTRdLFxuICBdLFxuICBbXG4gICAgW1wicmVtb3ZlTm9kZVwiLCBcIm15QXJyYXlcIl0sXG4gICAgW1wicmVtb3ZlTm9kZVwiLCBcImFycmF5LWFcIl0sXG4gICAgW1wicmVtb3ZlTm9kZVwiLCBcImFycmF5LWJcIl0sXG4gICAgW1wicmVtb3ZlTm9kZVwiLCBcImFycmF5LWNcIl0sXG4gICAgW1wicmVtb3ZlTm9kZVwiLCBcImFycmF5LWRcIl0sXG4gICAgW1wicmVtb3ZlTm9kZVwiLCBcImFycmF5LWVcIl0sXG4gIF0sXG5dXG4iLCJleHBvcnRzLmNvZGUgPSBgZnVuY3Rpb24gTXlCaWdBcHAoKSB7IC4uLiB9XG5cbnZhciBteUFwcCA9IG5ldyBNeUJpZ0FwcCgpO1xuXG4kKCcjY2xvc2UtYnV0dG9uJykuY2xpY2soXG4gIG15QXBwLmNsb3NlLmJpbmQobXlBcHApXG4pO1xuXG5teUFwcCA9IHVuZGVmaW5lZDtcbmBcblxuZXhwb3J0cy5zdGVwcyA9IFtcbiAgW1xuICAgIFtcImFkZE5vZGVcIiwge3R5cGU6IFwid2luZG93XCIsIGlkOiBcIndpbmRvd1wifV0sXG4gICAgW1wiYWRkTm9kZVwiLCB7ZGlzcGxheTogXCIjY2xvc2UtYnV0dG9uXCIsIHR5cGU6IFwib2JqZWN0XCIsIGlkOiBcImJ1dHRvblwifV0sXG4gICAgW1wiYWRkTGlua1wiLCB7c291cmNlOiBcIndpbmRvd1wiLCB0YXJnZXQ6IFwiYnV0dG9uXCIsIGRhc2hlZDogdHJ1ZX1dLFxuICAgIC8vIFtcImFkZE5vZGVcIiwge3R5cGU6IFwiY2FsbFN0YWNrXCIsIGlkOiBcImNhbGxTdGFja1wifV0sXG4gIF0sXG4gIFtcbiAgICBbXCJoaWdobGlnaHRcIiwgMV0sXG4gIF0sXG4gIFtcbiAgICBbXCJhZGROb2RlXCIsIHtkaXNwbGF5OiBcIi4gLiAuLiAgeyB9XCIsIHR5cGU6IFwib2JqZWN0XCIsIGlkOiBcIm15QXBwXCIsIHJhZGl1czogM31dLFxuICAgIFtcImFkZExpbmtcIiwge3NvdXJjZTogXCJ3aW5kb3dcIiwgdGFyZ2V0OiBcIm15QXBwXCIsIGRpc3BsYXk6IFwibXlBcHBcIiwgZGlzdGFuY2U6IDJ9XSxcbiAgICBbXCJoaWdobGlnaHRcIiwgM10sXG4gIF0sXG4gIFtcbiAgICBbXCJhZGROb2RlXCIsIHtkaXNwbGF5OiBcImZuKClcIiwgdHlwZTogXCJvYmplY3RcIiwgaWQ6IFwiY2xvc2VcIn1dLFxuICAgIFtcImFkZExpbmtcIiwge3NvdXJjZTogXCJjbG9zZVwiLCB0YXJnZXQ6IFwibXlBcHBcIiwgZGlzcGxheTogXCJiaW5kXCIsIGRpc3RhbmNlOiAyfV0sXG4gICAgW1wiaGlnaGxpZ2h0XCIsIDZdLFxuICBdLFxuICBbXG4gICAgW1wiYWRkTGlua1wiLCB7c291cmNlOiBcImJ1dHRvblwiLCB0YXJnZXQ6IFwiY2xvc2VcIiwgZGlzcGxheTogXCJjbGljayBoYW5kbGVyXCIsIGRpc3RhbmNlOiAyfV0sXG4gICAgW1wiaGlnaGxpZ2h0XCIsIFs1LCA3XV0sXG4gIF0sXG4gIFtcbiAgICBbXCJyZW1vdmVMaW5rXCIsIFtcIndpbmRvd1wiLFwibXlBcHBcIl1dLFxuICBdXG5dXG4iLCJleHBvcnRzLmNvZGUgPSBgZnVuY3Rpb24gY3JlYXRlVGVuRWxlbWVudHMoKSB7XG4gIHZhciBhcnJheSA9IFtdO1xuXG4gIGZvcih2YXIgaT0wOyBpIDwgMTA7IGkrKykge1xuICAgIGFycmF5W2ldID0gaTtcbiAgfVxuXG4gIHJldHVybiBhcnJheTtcbn1cblxudmFyIG15QXJyYXkgPSBjcmVhdGVUZW5FbGVtZW50cygpO1xuYFxuXG5leHBvcnRzLnN0ZXBzID0gW1xuICBbXG4gICAgW1wiYWRkTm9kZVwiLCB7dHlwZTogXCJ3aW5kb3dcIiwgaWQ6IFwid2luZG93XCJ9XSxcbiAgICBbXCJhZGROb2RlXCIsIHt0eXBlOiBcImNhbGxTdGFja1wiLCBpZDogXCJjYWxsU3RhY2tcIn1dLFxuICAgIC8vIFtcImFkZExpbmtcIiwge3NvdXJjZTogXCJ3aW5kb3dcIiwgdGFyZ2V0OiBcImNhbGxTdGFja1wiLCBkYXNoZWQ6IHRydWV9XSxcbiAgXSxcbiAgW1xuICAgIFtcImhpZ2hsaWdodFwiLCBbMSwgOV1dXG4gIF0sXG4gIFtcbiAgICBbXCJhZGROb2RlXCIsIHtkaXNwbGF5OiBcInNjb3BlXCIsIHR5cGU6IFwiZnVuY3Rpb25cIiwgaWQ6IFwiY3JlYXRlVGVuRWxlbWVudHNcIn1dLFxuICAgIFtcImFkZExpbmtcIiwge3NvdXJjZTogXCJjYWxsU3RhY2tcIiwgdGFyZ2V0OiBcImNyZWF0ZVRlbkVsZW1lbnRzXCIsIGRpc3BsYXk6IFwiY3JlYXRlVGVuRWxlbWVudHNcIn1dLFxuICAgIFtcImhpZ2hsaWdodFwiLCBbXCIxMToxNVwiLCBcIjExOjM0XCJdXVxuICBdLFxuICBbXG4gICAgW1wiYWRkTm9kZVwiLCB7ZGlzcGxheTogXCJbIF1cIiwgdHlwZTogXCJhcnJheVwiLCBpZDogXCJhcnJheVwifV0sXG4gICAgW1wiYWRkTGlua1wiLCB7ZGlzcGxheTogXCJhcnJheVwiLCBzb3VyY2U6IFwiY3JlYXRlVGVuRWxlbWVudHNcIiwgdGFyZ2V0OiBcImFycmF5XCJ9XSxcbiAgICBbXCJoaWdobGlnaHRcIiwgW1wiMjozXCIsIFwiMjoxOFwiXV0sXG4gIF0sXG4gIFtcbiAgICBbXCJoaWdobGlnaHRcIiwgWzQsIDZdXSxcbiAgICBbXCJhZGROb2RlXCIsIHtkaXNwbGF5OiBcIiBcIiwgdHlwZTogXCJ2YWx1ZVwiLCBpZDogXCJhcnJheS0wXCJ9XSxcbiAgICBbXCJhZGROb2RlXCIsIHtkaXNwbGF5OiBcIiBcIiwgdHlwZTogXCJ2YWx1ZVwiLCBpZDogXCJhcnJheS0xXCJ9XSxcbiAgICBbXCJhZGROb2RlXCIsIHtkaXNwbGF5OiBcIiBcIiwgdHlwZTogXCJ2YWx1ZVwiLCBpZDogXCJhcnJheS0yXCJ9XSxcbiAgICBbXCJhZGROb2RlXCIsIHtkaXNwbGF5OiBcIiBcIiwgdHlwZTogXCJ2YWx1ZVwiLCBpZDogXCJhcnJheS0zXCJ9XSxcbiAgICBbXCJhZGROb2RlXCIsIHtkaXNwbGF5OiBcIiBcIiwgdHlwZTogXCJ2YWx1ZVwiLCBpZDogXCJhcnJheS00XCJ9XSxcbiAgICBbXCJhZGROb2RlXCIsIHtkaXNwbGF5OiBcIiBcIiwgdHlwZTogXCJ2YWx1ZVwiLCBpZDogXCJhcnJheS01XCJ9XSxcbiAgICBbXCJhZGROb2RlXCIsIHtkaXNwbGF5OiBcIiBcIiwgdHlwZTogXCJ2YWx1ZVwiLCBpZDogXCJhcnJheS02XCJ9XSxcbiAgICBbXCJhZGROb2RlXCIsIHtkaXNwbGF5OiBcIiBcIiwgdHlwZTogXCJ2YWx1ZVwiLCBpZDogXCJhcnJheS03XCJ9XSxcbiAgICBbXCJhZGROb2RlXCIsIHtkaXNwbGF5OiBcIiBcIiwgdHlwZTogXCJ2YWx1ZVwiLCBpZDogXCJhcnJheS04XCJ9XSxcbiAgICBbXCJhZGROb2RlXCIsIHtkaXNwbGF5OiBcIiBcIiwgdHlwZTogXCJ2YWx1ZVwiLCBpZDogXCJhcnJheS05XCJ9XSxcbiAgICBbXCJhZGRMaW5rXCIsIHtkaXNwbGF5OiBcIjBcIiwgZGlzdGFuY2U6IDAuMSwgc291cmNlOiBcImFycmF5XCIsIHRhcmdldDogXCJhcnJheS0wXCJ9XSxcbiAgICBbXCJhZGRMaW5rXCIsIHtkaXNwbGF5OiBcIjFcIiwgZGlzdGFuY2U6IDAuMSwgc291cmNlOiBcImFycmF5XCIsIHRhcmdldDogXCJhcnJheS0xXCJ9XSxcbiAgICBbXCJhZGRMaW5rXCIsIHtkaXNwbGF5OiBcIjJcIiwgZGlzdGFuY2U6IDAuMSwgc291cmNlOiBcImFycmF5XCIsIHRhcmdldDogXCJhcnJheS0yXCJ9XSxcbiAgICBbXCJhZGRMaW5rXCIsIHtkaXNwbGF5OiBcIjNcIiwgZGlzdGFuY2U6IDAuMSwgc291cmNlOiBcImFycmF5XCIsIHRhcmdldDogXCJhcnJheS0zXCJ9XSxcbiAgICBbXCJhZGRMaW5rXCIsIHtkaXNwbGF5OiBcIjRcIiwgZGlzdGFuY2U6IDAuMSwgc291cmNlOiBcImFycmF5XCIsIHRhcmdldDogXCJhcnJheS00XCJ9XSxcbiAgICBbXCJhZGRMaW5rXCIsIHtkaXNwbGF5OiBcIjVcIiwgZGlzdGFuY2U6IDAuMSwgc291cmNlOiBcImFycmF5XCIsIHRhcmdldDogXCJhcnJheS01XCJ9XSxcbiAgICBbXCJhZGRMaW5rXCIsIHtkaXNwbGF5OiBcIjZcIiwgZGlzdGFuY2U6IDAuMSwgc291cmNlOiBcImFycmF5XCIsIHRhcmdldDogXCJhcnJheS02XCJ9XSxcbiAgICBbXCJhZGRMaW5rXCIsIHtkaXNwbGF5OiBcIjdcIiwgZGlzdGFuY2U6IDAuMSwgc291cmNlOiBcImFycmF5XCIsIHRhcmdldDogXCJhcnJheS03XCJ9XSxcbiAgICBbXCJhZGRMaW5rXCIsIHtkaXNwbGF5OiBcIjhcIiwgZGlzdGFuY2U6IDAuMSwgc291cmNlOiBcImFycmF5XCIsIHRhcmdldDogXCJhcnJheS04XCJ9XSxcbiAgICBbXCJhZGRMaW5rXCIsIHtkaXNwbGF5OiBcIjlcIiwgZGlzdGFuY2U6IDAuMSwgc291cmNlOiBcImFycmF5XCIsIHRhcmdldDogXCJhcnJheS05XCJ9XSxcbiAgXSxcbiAgW1xuICAgIFtcImhpZ2hsaWdodFwiLCA4XSxcbiAgXSxcbiAgW1xuICAgIFtcInJlbW92ZU5vZGVcIiwgXCJjcmVhdGVUZW5FbGVtZW50c1wiXSxcbiAgICAvLyBbXCJyZW1vdmVMaW5rXCIsIFtcImNhbGxTdGFja1wiLCBcImNyZWF0ZVRlbkVsZW1lbnRzXCJdXSxcbiAgICAvLyBbXCJyZW1vdmVMaW5rXCIsIFtcImNyZWF0ZVRlbkVsZW1lbnRzXCIsIFwiYXJyYXlcIl1dLFxuICAgIFtcImFkZExpbmtcIiwge2Rpc3BsYXk6IFwibXlBcnJheVwiLCBzb3VyY2U6IFwid2luZG93XCIsIHRhcmdldDogXCJhcnJheVwifV0sXG4gICAgW1wiaGlnaGxpZ2h0XCIsIFtcIjExOjFcIiwgXCIxMToxMlwiXV1cbiAgXVxuXVxuIiwiZXhwb3J0cy5jb2RlID0gYGZ1bmN0aW9uIGNyZWF0ZVRlbkVsZW1lbnRzKCkge1xuICB2YXIgYXJyYXkgPSBbXTtcblxuICBmb3IodmFyIGk9MDsgaSA8IDEwOyBpKyspIHtcbiAgICBhcnJheVtpXSA9IGk7XG4gIH1cbn1cblxuY3JlYXRlVGVuRWxlbWVudHMoKTtcbmBcblxuZXhwb3J0cy5zdGVwcyA9IFtcbiAgW1xuICAgIFtcImFkZE5vZGVcIiwge3R5cGU6IFwid2luZG93XCIsIGlkOiBcIndpbmRvd1wifV0sXG4gICAgW1wiYWRkTm9kZVwiLCB7dHlwZTogXCJjYWxsU3RhY2tcIiwgaWQ6IFwiY2FsbFN0YWNrXCJ9XSxcbiAgICAvLyBbXCJhZGRMaW5rXCIsIHtzb3VyY2U6IFwid2luZG93XCIsIHRhcmdldDogXCJjYWxsU3RhY2tcIiwgZGFzaGVkOiB0cnVlfV0sXG4gIF0sXG4gIFtcbiAgICBbXCJoaWdobGlnaHRcIiwgWzEsIDddXVxuICBdLFxuICBbXG4gICAgW1wiYWRkTm9kZVwiLCB7ZGlzcGxheTogXCJzY29wZVwiLCB0eXBlOiBcImZ1bmN0aW9uXCIsIGlkOiBcImNyZWF0ZVRlbkVsZW1lbnRzXCJ9XSxcbiAgICBbXCJhZGRMaW5rXCIsIHtzb3VyY2U6IFwiY2FsbFN0YWNrXCIsIHRhcmdldDogXCJjcmVhdGVUZW5FbGVtZW50c1wiLCBkaXNwbGF5OiBcImNyZWF0ZVRlbkVsZW1lbnRzXCJ9XSxcbiAgICBbXCJoaWdobGlnaHRcIiwgOV1cbiAgXSxcbiAgW1xuICAgIFtcImFkZE5vZGVcIiwge2Rpc3BsYXk6IFwiWyBdXCIsIHR5cGU6IFwiYXJyYXlcIiwgaWQ6IFwiYXJyYXlcIn1dLFxuICAgIFtcImFkZExpbmtcIiwge2Rpc3BsYXk6IFwiYXJyYXlcIiwgc291cmNlOiBcImNyZWF0ZVRlbkVsZW1lbnRzXCIsIHRhcmdldDogXCJhcnJheVwifV0sXG4gICAgW1wiaGlnaGxpZ2h0XCIsIFtcIjI6M1wiLCBcIjI6MThcIl1dLFxuICBdLFxuICBbXG4gICAgW1wiaGlnaGxpZ2h0XCIsIFs0LCA2XV0sXG4gICAgW1wiYWRkTm9kZVwiLCB7ZGlzcGxheTogXCIgXCIsIHR5cGU6IFwidmFsdWVcIiwgaWQ6IFwiYXJyYXktMFwifV0sXG4gICAgW1wiYWRkTm9kZVwiLCB7ZGlzcGxheTogXCIgXCIsIHR5cGU6IFwidmFsdWVcIiwgaWQ6IFwiYXJyYXktMVwifV0sXG4gICAgW1wiYWRkTm9kZVwiLCB7ZGlzcGxheTogXCIgXCIsIHR5cGU6IFwidmFsdWVcIiwgaWQ6IFwiYXJyYXktMlwifV0sXG4gICAgW1wiYWRkTm9kZVwiLCB7ZGlzcGxheTogXCIgXCIsIHR5cGU6IFwidmFsdWVcIiwgaWQ6IFwiYXJyYXktM1wifV0sXG4gICAgW1wiYWRkTm9kZVwiLCB7ZGlzcGxheTogXCIgXCIsIHR5cGU6IFwidmFsdWVcIiwgaWQ6IFwiYXJyYXktNFwifV0sXG4gICAgW1wiYWRkTm9kZVwiLCB7ZGlzcGxheTogXCIgXCIsIHR5cGU6IFwidmFsdWVcIiwgaWQ6IFwiYXJyYXktNVwifV0sXG4gICAgW1wiYWRkTm9kZVwiLCB7ZGlzcGxheTogXCIgXCIsIHR5cGU6IFwidmFsdWVcIiwgaWQ6IFwiYXJyYXktNlwifV0sXG4gICAgW1wiYWRkTm9kZVwiLCB7ZGlzcGxheTogXCIgXCIsIHR5cGU6IFwidmFsdWVcIiwgaWQ6IFwiYXJyYXktN1wifV0sXG4gICAgW1wiYWRkTm9kZVwiLCB7ZGlzcGxheTogXCIgXCIsIHR5cGU6IFwidmFsdWVcIiwgaWQ6IFwiYXJyYXktOFwifV0sXG4gICAgW1wiYWRkTm9kZVwiLCB7ZGlzcGxheTogXCIgXCIsIHR5cGU6IFwidmFsdWVcIiwgaWQ6IFwiYXJyYXktOVwifV0sXG4gICAgW1wiYWRkTGlua1wiLCB7ZGlzcGxheTogXCIwXCIsIGRpc3RhbmNlOiAwLjEsIHNvdXJjZTogXCJhcnJheVwiLCB0YXJnZXQ6IFwiYXJyYXktMFwifV0sXG4gICAgW1wiYWRkTGlua1wiLCB7ZGlzcGxheTogXCIxXCIsIGRpc3RhbmNlOiAwLjEsIHNvdXJjZTogXCJhcnJheVwiLCB0YXJnZXQ6IFwiYXJyYXktMVwifV0sXG4gICAgW1wiYWRkTGlua1wiLCB7ZGlzcGxheTogXCIyXCIsIGRpc3RhbmNlOiAwLjEsIHNvdXJjZTogXCJhcnJheVwiLCB0YXJnZXQ6IFwiYXJyYXktMlwifV0sXG4gICAgW1wiYWRkTGlua1wiLCB7ZGlzcGxheTogXCIzXCIsIGRpc3RhbmNlOiAwLjEsIHNvdXJjZTogXCJhcnJheVwiLCB0YXJnZXQ6IFwiYXJyYXktM1wifV0sXG4gICAgW1wiYWRkTGlua1wiLCB7ZGlzcGxheTogXCI0XCIsIGRpc3RhbmNlOiAwLjEsIHNvdXJjZTogXCJhcnJheVwiLCB0YXJnZXQ6IFwiYXJyYXktNFwifV0sXG4gICAgW1wiYWRkTGlua1wiLCB7ZGlzcGxheTogXCI1XCIsIGRpc3RhbmNlOiAwLjEsIHNvdXJjZTogXCJhcnJheVwiLCB0YXJnZXQ6IFwiYXJyYXktNVwifV0sXG4gICAgW1wiYWRkTGlua1wiLCB7ZGlzcGxheTogXCI2XCIsIGRpc3RhbmNlOiAwLjEsIHNvdXJjZTogXCJhcnJheVwiLCB0YXJnZXQ6IFwiYXJyYXktNlwifV0sXG4gICAgW1wiYWRkTGlua1wiLCB7ZGlzcGxheTogXCI3XCIsIGRpc3RhbmNlOiAwLjEsIHNvdXJjZTogXCJhcnJheVwiLCB0YXJnZXQ6IFwiYXJyYXktN1wifV0sXG4gICAgW1wiYWRkTGlua1wiLCB7ZGlzcGxheTogXCI4XCIsIGRpc3RhbmNlOiAwLjEsIHNvdXJjZTogXCJhcnJheVwiLCB0YXJnZXQ6IFwiYXJyYXktOFwifV0sXG4gICAgW1wiYWRkTGlua1wiLCB7ZGlzcGxheTogXCI5XCIsIGRpc3RhbmNlOiAwLjEsIHNvdXJjZTogXCJhcnJheVwiLCB0YXJnZXQ6IFwiYXJyYXktOVwifV0sXG4gIF0sXG4gIFtcbiAgICBbXCJyZW1vdmVOb2RlXCIsIFwiY3JlYXRlVGVuRWxlbWVudHNcIl0sXG4gIF0sXG4gIFtcbiAgICBbXCJyZW1vdmVOb2RlXCIsIFwiYXJyYXlcIl0sXG4gICAgW1wicmVtb3ZlTm9kZVwiLCBcImFycmF5LTBcIl0sXG4gICAgW1wicmVtb3ZlTm9kZVwiLCBcImFycmF5LTFcIl0sXG4gICAgW1wicmVtb3ZlTm9kZVwiLCBcImFycmF5LTJcIl0sXG4gICAgW1wicmVtb3ZlTm9kZVwiLCBcImFycmF5LTNcIl0sXG4gICAgW1wicmVtb3ZlTm9kZVwiLCBcImFycmF5LTRcIl0sXG4gICAgW1wicmVtb3ZlTm9kZVwiLCBcImFycmF5LTVcIl0sXG4gICAgW1wicmVtb3ZlTm9kZVwiLCBcImFycmF5LTZcIl0sXG4gICAgW1wicmVtb3ZlTm9kZVwiLCBcImFycmF5LTdcIl0sXG4gICAgW1wicmVtb3ZlTm9kZVwiLCBcImFycmF5LThcIl0sXG4gICAgW1wicmVtb3ZlTm9kZVwiLCBcImFycmF5LTlcIl0sXG4gIF1cbl1cbiIsImV4cG9ydHMuY29kZSA9IGB2YXIgc29tZUxpc3QgPSBbXTtcblxudmFyIG9iajEgPSB7IGxpbms6IHNvbWVMaXN0IH07XG52YXIgb2JqMiA9IHsgbGluazogc29tZUxpc3QgfTtcbnZhciBvYmozID0geyBsaW5rOiBzb21lTGlzdCB9O1xudmFyIG9iajQgPSB7IGxpbms6IHNvbWVMaXN0IH07XG5cbm9iajEgPSB1bmRlZmluZWQ7XG5vYmoyID0gdW5kZWZpbmVkO1xub2JqMyA9IHVuZGVmaW5lZDtcbm9iajQgPSB1bmRlZmluZWQ7XG5gXG5cbmV4cG9ydHMuc3RlcHMgPSBbXG4gIFtcbiAgICBbXCJhZGROb2RlXCIsIHt0eXBlOiBcIndpbmRvd1wiLCBpZDogXCJ3aW5kb3dcIn1dLFxuICBdLFxuICBbXG4gICAgW1wiYWRkTm9kZVwiLCB7ZGlzcGxheTogXCJbIF1cIiwgdHlwZTogXCJhcnJheVwiLCBpZDogXCJzb21lTGlzdFwifV0sXG4gICAgW1wiYWRkTGlua1wiLCB7c291cmNlOiBcIndpbmRvd1wiLCB0YXJnZXQ6XCJzb21lTGlzdFwiLCBkaXNwbGF5OiBcInNvbWVMaXN0XCIsIGRpc3RhbmNlOiAzfV0sXG4gICAgW1wiaGlnaGxpZ2h0XCIsIDFdLFxuICBdLFxuICBbXG4gICAgW1wiYWRkTm9kZVwiLCB7ZGlzcGxheTogXCJ7IH1cIiwgdHlwZTogXCJvYmplY3RcIiwgaWQ6IFwib2JqMVwifV0sXG4gICAgW1wiYWRkTGlua1wiLCB7c291cmNlOiBcIm9iajFcIiwgdGFyZ2V0OiBcInNvbWVMaXN0XCIsIGRpc3BsYXk6IFwibGlua1wifV0sXG4gICAgW1wiYWRkTGlua1wiLCB7c291cmNlOiBcIndpbmRvd1wiLCB0YXJnZXQ6XCJvYmoxXCIsIGRpc3BsYXk6IFwib2JqMVwifV0sXG4gICAgW1wiaGlnaGxpZ2h0XCIsIDNdLFxuICBdLFxuICBbXG4gICAgW1wiYWRkTm9kZVwiLCB7ZGlzcGxheTogXCJ7IH1cIiwgdHlwZTogXCJvYmplY3RcIiwgaWQ6IFwib2JqMlwifV0sXG4gICAgW1wiYWRkTGlua1wiLCB7c291cmNlOiBcIm9iajJcIiwgdGFyZ2V0OiBcInNvbWVMaXN0XCIsIGRpc3BsYXk6IFwibGlua1wifV0sXG4gICAgW1wiYWRkTGlua1wiLCB7c291cmNlOiBcIndpbmRvd1wiLCB0YXJnZXQ6XCJvYmoyXCIsIGRpc3BsYXk6IFwib2JqMlwifV0sXG4gICAgW1wiaGlnaGxpZ2h0XCIsIDRdLFxuICBdLFxuICBbXG4gICAgW1wiYWRkTm9kZVwiLCB7ZGlzcGxheTogXCJ7IH1cIiwgdHlwZTogXCJvYmplY3RcIiwgaWQ6IFwib2JqM1wifV0sXG4gICAgW1wiYWRkTGlua1wiLCB7c291cmNlOiBcIm9iajNcIiwgdGFyZ2V0OiBcInNvbWVMaXN0XCIsIGRpc3BsYXk6IFwibGlua1wifV0sXG4gICAgW1wiYWRkTGlua1wiLCB7c291cmNlOiBcIndpbmRvd1wiLCB0YXJnZXQ6XCJvYmozXCIsIGRpc3BsYXk6IFwib2JqM1wifV0sXG4gICAgW1wiaGlnaGxpZ2h0XCIsIDVdLFxuICBdLFxuICBbXG4gICAgW1wiYWRkTm9kZVwiLCB7ZGlzcGxheTogXCJ7IH1cIiwgdHlwZTogXCJvYmplY3RcIiwgaWQ6IFwib2JqNFwifV0sXG4gICAgW1wiYWRkTGlua1wiLCB7c291cmNlOiBcIm9iajRcIiwgdGFyZ2V0OiBcInNvbWVMaXN0XCIsIGRpc3BsYXk6IFwibGlua1wifV0sXG4gICAgW1wiYWRkTGlua1wiLCB7c291cmNlOiBcIndpbmRvd1wiLCB0YXJnZXQ6XCJvYmo0XCIsIGRpc3BsYXk6IFwib2JqNFwifV0sXG4gICAgW1wiaGlnaGxpZ2h0XCIsIDZdLFxuICBdLFxuICBbXG4gICAgW1wicmVtb3ZlTGlua1wiLCBbXCJ3aW5kb3dcIiwgXCJvYmoxXCJdXSxcbiAgICBbXCJoaWdobGlnaHRcIiwgOF0sXG4gIF0sXG4gIFtcbiAgICBbXCJyZW1vdmVMaW5rXCIsIFtcIndpbmRvd1wiLCBcIm9iajJcIl1dLFxuICAgIFtcImhpZ2hsaWdodFwiLCA5XSxcbiAgXSxcbiAgW1xuICAgIFtcInJlbW92ZUxpbmtcIiwgW1wid2luZG93XCIsIFwib2JqM1wiXV0sXG4gICAgW1wiaGlnaGxpZ2h0XCIsIDEwXSxcbiAgXSxcbiAgW1xuICAgIFtcInJlbW92ZUxpbmtcIiwgW1wid2luZG93XCIsIFwib2JqNFwiXV0sXG4gICAgW1wiaGlnaGxpZ2h0XCIsIDExXSxcbiAgXSxcbiAgW1xuICAgIFtcInJlbW92ZU5vZGVcIiwgXCJvYmoxXCJdLFxuICBdLFxuICBbXG4gICAgW1wicmVtb3ZlTm9kZVwiLCBcIm9iajJcIl0sXG4gIF0sXG4gIFtcbiAgICBbXCJyZW1vdmVOb2RlXCIsIFwib2JqM1wiXSxcbiAgXSxcbiAgW1xuICAgIFtcInJlbW92ZU5vZGVcIiwgXCJvYmo0XCJdLFxuICBdXG5dXG4iLCJleHBvcnRzLmNvZGUgPSBgZnVuY3Rpb24gY3JlYXRlTG9nZ2VyKCkge1xuICB2YXIgbWVzc2FnZXMgPSBbXTtcblxuICByZXR1cm4gZnVuY3Rpb24gbG9nZ2VyKG1lc3NhZ2UpIHtcbiAgICBtZXNzYWdlcy5wdXNoKG1lc3NhZ2UpO1xuICAgIGNvbnNvbGUubG9nKG1lc3NhZ2VzKTtcbiAgfVxufVxuXG52YXIgY2FwdGFpbnNMb2cgPSBjcmVhdGVMb2dnZXIoKTtcbnZhciBib3N1bnNMb2cgPSBjcmVhdGVMb2dnZXIoKTtcblxuY2FwdGFpbnNMb2coXCJDYXB0YWluJ3MgbG9nXCIpO1xuY2FwdGFpbnNMb2coXCJTdXBwbGVtZW50YWxcIik7XG5cbmJvc3Vuc0xvZyhcIkJvc3VuIGlzIHNob3J0IGZvciBib2F0c3dhaW4uXCIpXG5ib3N1bnNMb2coXCJTd2FiIHRoZSBkZWNrIG1hdGV5LlwiKVxuXG5jYXB0YWluc0xvZyA9IHVuZGVmaW5lZFxuYm9zdW5zTG9nID0gdW5kZWZpbmVkXG5gXG5cbmV4cG9ydHMuc3RlcHMgPSBbXG4gIFtcbiAgICBbXCJhZGROb2RlXCIsIHt0eXBlOiBcIndpbmRvd1wiLCBpZDogXCJ3aW5kb3dcIn1dLFxuICBdLFxuICBbXG4gICAgLy8gZnVuY3Rpb24gZGVmaW5pdGlvblxuICAgIFtcImhpZ2hsaWdodFwiLCBbMSw4XV0sXG4gIF0sXG4gIFtcbiAgICAvLyBjcmVhdGVMb2dnZXIoKVxuICAgIFtcImFkZE5vZGVcIiwge3R5cGU6IFwiY2FsbFN0YWNrXCIsIGlkOiBcImNhbGxTdGFja1wifV0sXG4gICAgW1wiaGlnaGxpZ2h0XCIsIFtcIjEwOjE5XCIsIFwiMTA6MzNcIl1dLFxuICBdLFxuICBbXG4gICAgLy8gZnVuY3Rpb24gYmxvY2tcbiAgICBbXCJhZGROb2RlXCIsIHtkaXNwbGF5OiBcInNjb3BlXCIsIHR5cGU6IFwiZnVuY3Rpb25cIiwgaWQ6IFwiY3JlYXRlTG9nZ2VyXCJ9XSxcbiAgICBbXCJhZGRMaW5rXCIsIHtzb3VyY2U6IFwiY2FsbFN0YWNrXCIsIHRhcmdldDogXCJjcmVhdGVMb2dnZXJcIiwgZGlzcGxheTogXCJjcmVhdGVMb2dnZXJcIn1dLFxuICAgIFtcImhpZ2hsaWdodFwiLCBbMiwgN11dLFxuICBdLFxuICBbXG4gICAgLy8gdmFyIG1lc3NhZ2VzID0gW11cbiAgICBbXCJhZGROb2RlXCIsIHtkaXNwbGF5OiBcIlsgXVwiLCB0eXBlOiBcImFycmF5XCIsIGlkOiBcIm1lc3NhZ2VzMVwifV0sXG4gICAgW1wiYWRkTGlua1wiLCB7c291cmNlOiBcImNyZWF0ZUxvZ2dlclwiLCB0YXJnZXQ6IFwibWVzc2FnZXMxXCIsIGRpc3BsYXk6IFwibWVzc2FnZXNcIn1dLFxuICAgIFtcImhpZ2hsaWdodFwiLCAyXSxcbiAgXSxcbiAgW1xuICAgIC8vIGZ1bmN0aW9uIGxvZ2dlcigpIHt9XG4gICAgW1wiYWRkTm9kZVwiLCB7ZGlzcGxheTogXCJmblwiLCB0eXBlOiBcImZ1bmN0aW9uXCIsIGlkOiBcImNhcHRhaW5zTG9nXCJ9XSxcbiAgICBbXCJhZGRMaW5rXCIsIHtzb3VyY2U6IFwiY3JlYXRlTG9nZ2VyXCIsIHRhcmdldDogXCJjYXB0YWluc0xvZ1wiLCBkaXNwbGF5OiBcImxvZ2dlclwifV0sXG4gICAgW1wiaGlnaGxpZ2h0XCIsIFtcIjQ6MTBcIiwgXCI3OjRcIl1dLFxuICBdLFxuICBbXG4gICAgLy8gbWVzc2FnZXNcbiAgICBbXCJhZGRMaW5rXCIsIHtzb3VyY2U6IFwiY2FwdGFpbnNMb2dcIiwgdGFyZ2V0OiBcIm1lc3NhZ2VzMVwiLCBkaXNwbGF5OiBcIm1lc3NhZ2VzXCJ9XSxcbiAgICBbXCJoaWdobGlnaHRcIiwgW1wiNTo1XCIsIFwiNToxM1wiXV0sXG4gIF0sXG4gIFtcbiAgICAvLyByZXR1cm5cbiAgICBbXCJyZW1vdmVOb2RlXCIsIFwiY3JlYXRlTG9nZ2VyXCJdLFxuICAgIFtcInJlbW92ZU5vZGVcIiwgXCJjYWxsU3RhY2tcIl0sXG4gICAgW1wiaGlnaGxpZ2h0XCIsIFtcIjQ6M1wiLCBcIjQ6OVwiXV0sXG4gIF0sXG4gIFtcbiAgICAvLyB2YXIgY2FwdGFpbnNMb2dcbiAgICBbXCJhZGRMaW5rXCIsIHtzb3VyY2U6IFwid2luZG93XCIsIHRhcmdldDogXCJjYXB0YWluc0xvZ1wiLCBkaXNwbGF5OiBcImNhcHRhaW5zTG9nXCJ9XSxcbiAgICBbXCJoaWdobGlnaHRcIiwgW1wiMTA6MVwiLCBcIjEwOjE2XCJdXSxcbiAgXSxcbiAgW1xuICAgIC8vIHZhciBib3N1bnNMb2cgPSBjcmVhdGVMb2dnZXIoKVxuICAgIFtcImFkZE5vZGVcIiwge2Rpc3BsYXk6IFwiWyBdXCIsIHR5cGU6IFwiYXJyYXlcIiwgaWQ6IFwibWVzc2FnZXMyXCJ9XSxcbiAgICBbXCJhZGROb2RlXCIsIHtkaXNwbGF5OiBcImZuXCIsIHR5cGU6IFwiZnVuY3Rpb25cIiwgaWQ6IFwiYm9zdW5zTG9nXCJ9XSxcbiAgICBbXCJhZGRMaW5rXCIsIHtzb3VyY2U6IFwid2luZG93XCIsIHRhcmdldDogXCJib3N1bnNMb2dcIiwgZGlzcGxheTogXCJib25zdW5zTG9nXCJ9XSxcbiAgICBbXCJhZGRMaW5rXCIsIHtzb3VyY2U6IFwiYm9zdW5zTG9nXCIsIHRhcmdldDogXCJtZXNzYWdlczJcIiwgZGlzcGxheTogXCJtZXNzYWdlc1wifV0sXG4gICAgW1wiaGlnaGxpZ2h0XCIsIDExXSxcbiAgXSxcbiAgW1xuICAgIC8vIGNhcHRhaW5zTG9nKFwiQ2FwdGFpbidzIGxvZ1wiKVxuICAgIFtcImhpZ2hsaWdodFwiLCAxM10sXG4gIF0sXG4gIFtcbiAgICAvLyBtZXNzYWdlcy5wdXNoKG1lc3NhZ2UpXG4gICAgW1wiYWRkTm9kZVwiLCB7ZGlzcGxheTogJ1wiQ2FwdGFpblxcJ3MgbG9nXCInLCB0eXBlOiBcInZhbHVlXCIsIGlkOiBcInN0cmluZzFcIn1dLFxuICAgIFtcImFkZExpbmtcIiwge3NvdXJjZTogXCJtZXNzYWdlczFcIiwgdGFyZ2V0OiBcInN0cmluZzFcIn1dLFxuICAgIFtcImhpZ2hsaWdodFwiLCA1XSxcbiAgXSxcbiAgW1xuICAgIC8vIGNvbnNvbGUubG9nKG1lc3NhZ2VzKVxuICAgIFtcImhpZ2hsaWdodFwiLCA2XSxcbiAgXSxcbiAgW1xuICAgIC8vIGNhcHRhaW5zTG9nKFwiU3VwcGxlbWVudGFsXCIpO1xuICAgIFtcImFkZE5vZGVcIiwge2Rpc3BsYXk6ICdcIlN1cHBsZW1lbnRhbFwiJywgdHlwZTogXCJ2YWx1ZVwiLCBpZDogXCJzdHJpbmcyXCJ9XSxcbiAgICBbXCJhZGRMaW5rXCIsIHtzb3VyY2U6IFwibWVzc2FnZXMxXCIsIHRhcmdldDogXCJzdHJpbmcyXCJ9XSxcbiAgICBbXCJoaWdobGlnaHRcIiwgMTRdLFxuICBdLFxuICBbXG4gICAgLy8gYm9zdW5zTG9nKFwiQm9zdW4gaXMgc2hvcnQgZm9yIGJvdHN3YWluLlwiKVxuICAgIFtcImhpZ2hsaWdodFwiLCAxNl0sXG4gICAgW1wiYWRkTm9kZVwiLCB7ZGlzcGxheTogJ1wiQm9zdW4gaXMuLi5cIicsIHR5cGU6IFwidmFsdWVcIiwgaWQ6IFwic3RyaW5nM1wifV0sXG4gICAgW1wiYWRkTGlua1wiLCB7c291cmNlOiBcIm1lc3NhZ2VzMlwiLCB0YXJnZXQ6IFwic3RyaW5nM1wifV0sXG4gIF0sXG4gIFtcbiAgICAvLyBib3N1bnNMb2coXCJTd2FiIHRoZSBkZWNrXCIpXG4gICAgW1wiaGlnaGxpZ2h0XCIsIDE3XSxcbiAgICBbXCJhZGROb2RlXCIsIHtkaXNwbGF5OiAnXCJTd2FiIHRoZSBkZWNrLi4uXCInLCB0eXBlOiBcInZhbHVlXCIsIGlkOiBcInN0cmluZzRcIn1dLFxuICAgIFtcImFkZExpbmtcIiwge3NvdXJjZTogXCJtZXNzYWdlczJcIiwgdGFyZ2V0OiBcInN0cmluZzRcIn1dLFxuICBdLFxuICBbXG4gICAgLy8gY2FwdGFpbnNMb2cgPSB1bmRlZmluZWRcbiAgICBbXCJoaWdobGlnaHRcIiwgMTldLFxuICAgIFtcInJlbW92ZUxpbmtcIiwgW1wid2luZG93XCIsIFwiY2FwdGFpbnNMb2dcIl1dLFxuICBdLFxuICBbXG4gICAgLy8gYm9zdW5zTG9nID0gdW5kZWZpbmVkXG4gICAgW1wiaGlnaGxpZ2h0XCIsIDIwXSxcbiAgICBbXCJyZW1vdmVMaW5rXCIsIFtcIndpbmRvd1wiLCBcImJvc3Vuc0xvZ1wiXV0sXG4gIF0sXG4gIFtcbiAgICBbXCJyZW1vdmVOb2RlXCIsIFwiY2FwdGFpbnNMb2dcIl0sXG4gICAgW1wicmVtb3ZlTm9kZVwiLCBcImJvc3Vuc0xvZ1wiXSxcbiAgICBbXCJyZW1vdmVOb2RlXCIsIFwic3RyaW5nMVwiXSxcbiAgICBbXCJyZW1vdmVOb2RlXCIsIFwic3RyaW5nMlwiXSxcbiAgICBbXCJyZW1vdmVOb2RlXCIsIFwic3RyaW5nM1wiXSxcbiAgICBbXCJyZW1vdmVOb2RlXCIsIFwic3RyaW5nNFwiXSxcbiAgICBbXCJyZW1vdmVOb2RlXCIsIFwibWVzc2FnZXMxXCJdLFxuICAgIFtcInJlbW92ZU5vZGVcIiwgXCJtZXNzYWdlczJcIl0sXG4gIF0sXG5dXG4iLCJleHBvcnRzLmNvZGUgPSBgZnVuY3Rpb24gQ2xpY2tDb3VudGVyKCkge1xuICB0aGlzLmNvdW50Q2xpY2tzID0gMDtcbiAgdmFyIHNjb3BlID0gdGhpcztcbiAgdGhpcy5oYW5kbGVyID0gZnVuY3Rpb24gYnV0dG9uQ2xpY2soKSB7XG4gICAgc2NvcGUuY291bnRDbGlja3MrKztcbiAgfTtcblxuICAkKCdidXR0b24nKS5vbignY2xpY2snLCB0aGlzLmhhbmRsZXIpO1xufVxuXG5DbGlja0NvdW50ZXIucHJvdG90eXBlLmRlc3Ryb3kgPSBmdW5jdGlvbigpIHtcbiAgJCgnYnV0dG9uJykub2ZmKCdjbGljaycsIHRoaXMuaGFuZGxlcik7XG59XG5cbnZhciBjbGlja0NvdW50ZXIxID0gbmV3IENsaWNrQ291bnRlcigpO1xudmFyIGNsaWNrQ291bnRlcjIgPSBuZXcgQ2xpY2tDb3VudGVyKCk7XG52YXIgY2xpY2tDb3VudGVyMyA9IG5ldyBDbGlja0NvdW50ZXIoKTtcblxuLy8gU3RvcCBleGVjdXRpb24sIHRoZW4gbGF0ZXIgcnVuOlxuXG5jbGlja0NvdW50ZXIxLmRlc3Ryb3koKTtcbmNsaWNrQ291bnRlcjIuZGVzdHJveSgpO1xuY2xpY2tDb3VudGVyMy5kZXN0cm95KCk7XG5cbmRlbGV0ZSBjbGlja0NvdW50ZXIxO1xuZGVsZXRlIGNsaWNrQ291bnRlcjI7XG5kZWxldGUgY2xpY2tDb3VudGVyMztcbmBcblxuZXhwb3J0cy5zdGVwcyA9IFtcbiAgW1xuICAgIFtcImFkZE5vZGVcIiwge3R5cGU6IFwid2luZG93XCIsIGlkOiBcIndpbmRvd1wifV0sXG4gICAgW1wiYWRkTm9kZVwiLCB7ZGlzcGxheTogXCJidXR0b25cIiwgdHlwZTogXCJvYmplY3RcIiwgaWQ6IFwiYnV0dG9uXCJ9XSxcbiAgICBbXCJhZGRMaW5rXCIsIHtzb3VyY2U6IFwid2luZG93XCIsIHRhcmdldDogXCJidXR0b25cIiwgZGFzaGVkOiB0cnVlfV0sXG5cbiAgICAvLyBjbGlja0NvdW50ZXIxXG4gICAgW1wiYWRkTm9kZVwiLCB7ZGlzcGxheTogXCJjbGlja0NvdW50ZXIxXCIsIHR5cGU6IFwib2JqZWN0XCIsIGlkOiBcImNsaWNrQ291bnRlcjFcIn1dLFxuICAgIFtcImFkZE5vZGVcIiwge2Rpc3BsYXk6IFwiYnV0dG9uQ2xpY2tcIiwgdHlwZTogXCJmdW5jdGlvblwiLCBpZDogXCJidXR0b25DbGljazFcIn1dLFxuICAgIFtcImFkZExpbmtcIiwge3NvdXJjZTogXCJ3aW5kb3dcIiwgdGFyZ2V0OiBcImNsaWNrQ291bnRlcjFcIn1dLFxuICAgIFtcImFkZExpbmtcIiwge3NvdXJjZTogXCJidXR0b25DbGljazFcIiwgdGFyZ2V0OiBcImNsaWNrQ291bnRlcjFcIn1dLFxuICAgIFtcImFkZExpbmtcIiwge3NvdXJjZTogXCJidXR0b25cIiwgdGFyZ2V0OiBcImJ1dHRvbkNsaWNrMVwifV0sXG5cbiAgICAvLyBjbGlja0NvdW50ZXIyXG4gICAgW1wiYWRkTm9kZVwiLCB7ZGlzcGxheTogXCJjbGlja0NvdW50ZXIyXCIsIHR5cGU6IFwib2JqZWN0XCIsIGlkOiBcImNsaWNrQ291bnRlcjJcIn1dLFxuICAgIFtcImFkZE5vZGVcIiwge2Rpc3BsYXk6IFwiYnV0dG9uQ2xpY2tcIiwgdHlwZTogXCJmdW5jdGlvblwiLCBpZDogXCJidXR0b25DbGljazJcIn1dLFxuICAgIFtcImFkZExpbmtcIiwge3NvdXJjZTogXCJ3aW5kb3dcIiwgdGFyZ2V0OiBcImNsaWNrQ291bnRlcjJcIn1dLFxuICAgIFtcImFkZExpbmtcIiwge3NvdXJjZTogXCJidXR0b25DbGljazJcIiwgdGFyZ2V0OiBcImNsaWNrQ291bnRlcjJcIn1dLFxuICAgIFtcImFkZExpbmtcIiwge3NvdXJjZTogXCJidXR0b25cIiwgdGFyZ2V0OiBcImJ1dHRvbkNsaWNrMlwifV0sXG5cbiAgICAvLyBjbGlja0NvdW50ZXIzXG4gICAgW1wiYWRkTm9kZVwiLCB7ZGlzcGxheTogXCJjbGlja0NvdW50ZXIzXCIsIHR5cGU6IFwib2JqZWN0XCIsIGlkOiBcImNsaWNrQ291bnRlcjNcIn1dLFxuICAgIFtcImFkZE5vZGVcIiwge2Rpc3BsYXk6IFwiYnV0dG9uQ2xpY2tcIiwgdHlwZTogXCJmdW5jdGlvblwiLCBpZDogXCJidXR0b25DbGljazNcIn1dLFxuICAgIFtcImFkZExpbmtcIiwge3NvdXJjZTogXCJ3aW5kb3dcIiwgdGFyZ2V0OiBcImNsaWNrQ291bnRlcjNcIn1dLFxuICAgIFtcImFkZExpbmtcIiwge3NvdXJjZTogXCJidXR0b25DbGljazNcIiwgdGFyZ2V0OiBcImNsaWNrQ291bnRlcjNcIn1dLFxuICAgIFtcImFkZExpbmtcIiwge3NvdXJjZTogXCJidXR0b25cIiwgdGFyZ2V0OiBcImJ1dHRvbkNsaWNrM1wifV0sXG4gICAgW1wiaGlnaGxpZ2h0XCIsIDE5XSxcbiAgXSxcbiAgW1xuICAgIFtcInJlbW92ZUxpbmtcIiwgW1wiYnV0dG9uXCIsIFwiYnV0dG9uQ2xpY2sxXCJdXSxcbiAgICBbXCJoaWdobGlnaHRcIiwgMjFdLFxuICBdLFxuICBbXG4gICAgW1wicmVtb3ZlTGlua1wiLCBbXCJidXR0b25cIiwgXCJidXR0b25DbGljazJcIl1dLFxuICAgIFtcImhpZ2hsaWdodFwiLCAyMl0sXG4gIF0sXG4gIFtcbiAgICBbXCJyZW1vdmVMaW5rXCIsIFtcImJ1dHRvblwiLCBcImJ1dHRvbkNsaWNrM1wiXV0sXG4gICAgW1wiaGlnaGxpZ2h0XCIsIDIzXSxcbiAgXSxcbiAgW1xuICAgIFtcInJlbW92ZUxpbmtcIiwgW1wid2luZG93XCIsIFwiY2xpY2tDb3VudGVyMVwiXV0sXG4gICAgW1wiaGlnaGxpZ2h0XCIsIDI1XSxcbiAgXSxcbiAgW1xuICAgIFtcInJlbW92ZUxpbmtcIiwgW1wid2luZG93XCIsIFwiY2xpY2tDb3VudGVyMlwiXV0sXG4gICAgW1wiaGlnaGxpZ2h0XCIsIDI2XSxcbiAgXSxcbiAgW1xuICAgIFtcInJlbW92ZUxpbmtcIiwgW1wid2luZG93XCIsIFwiY2xpY2tDb3VudGVyM1wiXV0sXG4gICAgW1wiaGlnaGxpZ2h0XCIsIDI3XSxcbiAgXSxcbiAgW1xuICAgIFtcInJlbW92ZU5vZGVcIiwgXCJjbGlja0NvdW50ZXIxXCJdLFxuICAgIFtcInJlbW92ZU5vZGVcIiwgXCJidXR0b25DbGljazFcIl0sXG4gIF0sXG4gIFtcbiAgICBbXCJyZW1vdmVOb2RlXCIsIFwiY2xpY2tDb3VudGVyMlwiXSxcbiAgICBbXCJyZW1vdmVOb2RlXCIsIFwiYnV0dG9uQ2xpY2syXCJdLFxuICBdLFxuICBbXG4gICAgW1wicmVtb3ZlTm9kZVwiLCBcImNsaWNrQ291bnRlcjNcIl0sXG4gICAgW1wicmVtb3ZlTm9kZVwiLCBcImJ1dHRvbkNsaWNrM1wiXSxcbiAgXVxuXVxuIiwiZXhwb3J0cy5jb2RlID0gYGZ1bmN0aW9uIENsaWNrQ291bnRlcigpIHtcbiAgdGhpcy5jb3VudENsaWNrcyA9IDA7XG5cbiAgdmFyIHNjb3BlID0gdGhpcztcbiAgJCgnYnV0dG9uJykuY2xpY2soZnVuY3Rpb24gYnV0dG9uQ2xpY2soKSB7XG4gICAgc2NvcGUuY291bnRDbGlja3MrKztcbiAgfSk7XG59XG5cbnZhciBjbGlja0NvdW50ZXIxID0gbmV3IENsaWNrQ291bnRlcigpO1xudmFyIGNsaWNrQ291bnRlcjIgPSBuZXcgQ2xpY2tDb3VudGVyKCk7XG52YXIgY2xpY2tDb3VudGVyMyA9IG5ldyBDbGlja0NvdW50ZXIoKTtcblxuLy8gU3RvcCBleGVjdXRpb24sIHRoZW4gbGF0ZXIgcnVuOlxuXG5jbGlja0NvdW50ZXIxID0gdW5kZWZpbmVkO1xuY2xpY2tDb3VudGVyMiA9IHVuZGVmaW5lZDtcbmNsaWNrQ291bnRlcjMgPSB1bmRlZmluZWQ7XG5gXG5cbmV4cG9ydHMuc3RlcHMgPSBbXG4gIFtcbiAgICBbXCJhZGROb2RlXCIsIHt0eXBlOiBcIndpbmRvd1wiLCBpZDogXCJ3aW5kb3dcIn1dLFxuICAgIFtcImFkZE5vZGVcIiwge2Rpc3BsYXk6IFwiYnV0dG9uXCIsIHR5cGU6IFwib2JqZWN0XCIsIGlkOiBcImJ1dHRvblwifV0sXG4gICAgW1wiYWRkTGlua1wiLCB7c291cmNlOiBcIndpbmRvd1wiLCB0YXJnZXQ6IFwiYnV0dG9uXCIsIGRhc2hlZDogdHJ1ZX1dLFxuICAgIFtcImFkZE5vZGVcIiwge3R5cGU6IFwiY2FsbFN0YWNrXCIsIGlkOiBcImNhbGxTdGFja1wifV0sXG4gIF0sXG4gIFtcbiAgICBbXCJoaWdobGlnaHRcIiwgWzEsIDhdXSxcbiAgXSxcbiAgW1xuICAgIFtcImFkZE5vZGVcIiwge2Rpc3BsYXk6IFwieyB9XCIsIHR5cGU6IFwib2JqZWN0XCIsIGlkOiBcImNsaWNrQ291bnRlcjFcIn1dLFxuICAgIFtcImhpZ2hsaWdodFwiLCBbXCIxMDoyMVwiLCBcIjEwOjM5XCJdXSxcbiAgXSxcbiAgW1xuICAgIC8vIFtcImFkZExpbmtcIiwge3NvdXJjZTogXCJ3aW5kb3dcIiwgdGFyZ2V0OiBcImNhbGxTdGFja1wiLCBkYXNoZWQ6IHRydWV9XSxcbiAgICBbXCJhZGROb2RlXCIsIHtkaXNwbGF5OiBcInNjb3BlXCIsIHR5cGU6IFwiZnVuY3Rpb25cIiwgaWQ6IFwic2NvcGUxXCJ9XSxcbiAgICBbXCJhZGRMaW5rXCIsIHtkaXNwbGF5OiBcIkNsaWNrQ291bnRlclwiLCBzb3VyY2U6IFwiY2FsbFN0YWNrXCIsIHRhcmdldDogXCJzY29wZTFcIn1dLFxuICAgIFtcImFkZExpbmtcIiwge2Rpc3BsYXk6IFwidGhpc1wiLCBzb3VyY2U6IFwic2NvcGUxXCIsIHRhcmdldDogXCJjbGlja0NvdW50ZXIxXCJ9XSxcbiAgICBbXCJoaWdobGlnaHRcIiwgWzIsIDddXSxcbiAgXSxcblxuICBbXG4gICAgW1wiYWRkTm9kZVwiLCB7ZGlzcGxheTogXCIwXCIsIHR5cGU6IFwidmFsdWVcIiwgaWQ6IFwiY291bnRDbGlja3MxXCJ9XSxcbiAgICBbXCJhZGRMaW5rXCIsIHtkaXNwbGF5OiBcImNvdW50Q2xpY2tzXCIsIHNvdXJjZTogXCJjbGlja0NvdW50ZXIxXCIsIHRhcmdldDogXCJjb3VudENsaWNrczFcIn1dLFxuICAgIFtcImhpZ2hsaWdodFwiLCBbXCIyOjNcIiwgXCIyOjI0XCJdXSxcbiAgXSxcbiAgW1xuICAgIFtcInJlbmFtZUxpbmtcIiwge2Rpc3BsYXk6IFwidGhpcyAvIHNjb3BlXCIsIHNvdXJjZTogXCJzY29wZTFcIiwgdGFyZ2V0OiBcImNsaWNrQ291bnRlcjFcIn1dLFxuICAgIFtcImhpZ2hsaWdodFwiLCBbXCI0OjNcIiwgXCI0OjIwXCJdXSxcbiAgXSxcbiAgW1xuICAgIFtcImFkZE5vZGVcIiwge2Rpc3BsYXk6IFwiZm5cIiwgdHlwZTogXCJmdW5jdGlvblwiLCBpZDogXCJidXR0b25DbGljazFcIn1dLFxuICAgIFtcImFkZExpbmtcIiwge3NvdXJjZTogXCJzY29wZTFcIiwgdGFyZ2V0OiBcImJ1dHRvbkNsaWNrMVwifV0sXG4gICAgW1wiaGlnaGxpZ2h0XCIsIFtcIjU6MjFcIiwgXCI3OjRcIl1dLFxuICBdLFxuICBbXG4gICAgW1wiYWRkTGlua1wiLCB7c291cmNlOiBcImJ1dHRvbkNsaWNrMVwiLCB0YXJnZXQ6IFwiY2xpY2tDb3VudGVyMVwifV0sXG4gICAgW1wiaGlnaGxpZ2h0XCIsIFtcIjY6NVwiLCBcIjY6MTBcIl1dLFxuICBdLFxuICBbXG4gICAgW1wiYWRkTGlua1wiLCB7ZGlzcGxheTogXCJvbkNsaWNrXCIsIHNvdXJjZTogXCJidXR0b25cIiwgdGFyZ2V0OiBcImJ1dHRvbkNsaWNrMVwifV0sXG4gICAgW1wiaGlnaGxpZ2h0XCIsIFs1LCA3XV0sXG4gIF0sXG4gIFtcbiAgICBbXCJyZW1vdmVOb2RlXCIsIFwiY291bnRDbGlja3MxXCJdXG4gIF0sXG4gIFtcbiAgICBbXCJyZW1vdmVOb2RlXCIsIFwic2NvcGUxXCJdLFxuICBdLFxuICBbXG4gICAgW1wiYWRkTGlua1wiLCB7ZGlzcGxheTogXCJjbGlja0NvdW50ZXIxXCIsIHNvdXJjZTogXCJ3aW5kb3dcIiwgdGFyZ2V0OiBcImNsaWNrQ291bnRlcjFcIiwgZGlzdGFuY2U6IDJ9XSxcbiAgICBbXCJoaWdobGlnaHRcIiwgW1wiMTA6MVwiLCBcIjEwOjE4XCJdXSxcbiAgXSxcbiAgW1xuICAgIFtcImFkZE5vZGVcIiwge2Rpc3BsYXk6IFwie31cIiwgdHlwZTogXCJvYmplY3RcIiwgaWQ6IFwiY2xpY2tDb3VudGVyMlwifV0sXG4gICAgW1wiYWRkTm9kZVwiLCB7ZGlzcGxheTogXCJmblwiLCB0eXBlOiBcImZ1bmN0aW9uXCIsIGlkOiBcImJ1dHRvbkNsaWNrMlwifV0sXG4gICAgW1wiYWRkTGlua1wiLCB7ZGlzcGxheTogXCJjbGlja0NvdW50ZXIyXCIsIHNvdXJjZTogXCJ3aW5kb3dcIiwgdGFyZ2V0OiBcImNsaWNrQ291bnRlcjJcIiwgZGlzdGFuY2U6IDJ9XSxcbiAgICBbXCJhZGRMaW5rXCIsIHtzb3VyY2U6IFwiYnV0dG9uQ2xpY2syXCIsIHRhcmdldDogXCJjbGlja0NvdW50ZXIyXCJ9XSxcbiAgICBbXCJhZGRMaW5rXCIsIHtkaXNwbGF5OiBcIm9uQ2xpY2tcIiwgc291cmNlOiBcImJ1dHRvblwiLCB0YXJnZXQ6IFwiYnV0dG9uQ2xpY2syXCJ9XSxcbiAgICBbXCJoaWdobGlnaHRcIiwgMTFdLFxuICBdLFxuICBbXG4gICAgW1wiYWRkTm9kZVwiLCB7ZGlzcGxheTogXCJ7fVwiLCB0eXBlOiBcIm9iamVjdFwiLCBpZDogXCJjbGlja0NvdW50ZXIzXCJ9XSxcbiAgICBbXCJhZGROb2RlXCIsIHtkaXNwbGF5OiBcImZuXCIsIHR5cGU6IFwiZnVuY3Rpb25cIiwgaWQ6IFwiYnV0dG9uQ2xpY2szXCJ9XSxcbiAgICBbXCJhZGRMaW5rXCIsIHtkaXNwbGF5OiBcImNsaWNrQ291bnRlcjNcIiwgc291cmNlOiBcIndpbmRvd1wiLCB0YXJnZXQ6IFwiY2xpY2tDb3VudGVyM1wifV0sXG4gICAgW1wiYWRkTGlua1wiLCB7c291cmNlOiBcImJ1dHRvbkNsaWNrM1wiLCB0YXJnZXQ6IFwiY2xpY2tDb3VudGVyM1wifV0sXG4gICAgW1wiYWRkTGlua1wiLCB7ZGlzcGxheTogXCJvbkNsaWNrXCIsIHNvdXJjZTogXCJidXR0b25cIiwgdGFyZ2V0OiBcImJ1dHRvbkNsaWNrM1wifV0sXG4gICAgW1wiaGlnaGxpZ2h0XCIsIDEyXSxcbiAgXSxcbiAgW1xuICAgIFtcInJlbW92ZUxpbmtcIiwgW1wid2luZG93XCIsIFwiY2xpY2tDb3VudGVyMVwiXV0sXG4gICAgW1wiaGlnaGxpZ2h0XCIsIDE2XSxcbiAgXSxcbiAgW1xuICAgIFtcInJlbW92ZUxpbmtcIiwgW1wid2luZG93XCIsIFwiY2xpY2tDb3VudGVyMlwiXV0sXG4gICAgW1wiaGlnaGxpZ2h0XCIsIDE3XSxcbiAgXSxcbiAgW1xuICAgIFtcInJlbW92ZUxpbmtcIiwgW1wid2luZG93XCIsIFwiY2xpY2tDb3VudGVyM1wiXV0sXG4gICAgW1wiaGlnaGxpZ2h0XCIsIDE4XSxcbiAgXVxuXVxuIiwibW9kdWxlLmV4cG9ydHMgPSB7XG4gIFwiYmFzaWNzXCIgOiByZXF1aXJlKCcuL2Jhc2ljcycpLFxuICBcImRpcmVjdGlvbmFsXCIgOiByZXF1aXJlKCcuL2RpcmVjdGlvbmFsJyksXG4gIFwiY3JlYXRlLXRlbi1lbGVtZW50c1wiIDogcmVxdWlyZSgnLi9jcmVhdGUtdGVuLWVsZW1lbnRzJyksXG4gIFwiY3JlYXRlLXRlbi1lbGVtZW50cy1yZXR1cm5zXCIgOiByZXF1aXJlKCcuL2NyZWF0ZS10ZW4tZWxlbWVudHMtcmV0dXJucycpLFxuICBcImFjY2lkZW50YWwtZ2xvYmFsc1wiIDogcmVxdWlyZSgnLi9hY2NpZGVudGFsLWdsb2JhbHMnKSxcbiAgXCJmdW5jdGlvbi1jYXB0dXJlXCIgOiByZXF1aXJlKCcuL2Z1bmN0aW9uLWNhcHR1cmUnKSxcbiAgXCJiaW5kLWV2ZW50XCIgOiByZXF1aXJlKCcuL2JpbmQtZXZlbnQnKSxcbiAgXCJoYW5kbGVyLWxlYWtcIiA6IHJlcXVpcmUoJy4vaGFuZGxlci1sZWFrJyksXG4gIFwiaGFuZGxlci1sZWFrLWZpeFwiIDogcmVxdWlyZSgnLi9oYW5kbGVyLWxlYWstZml4JyksXG4gIFwibWFwLWNhY2hlXCIgOiByZXF1aXJlKCcuL21hcC1jYWNoZScpLFxuICBcIndlYWttYXAtY2FjaGVcIiA6IHJlcXVpcmUoJy4vd2Vha21hcC1jYWNoZScpLFxufVxuIiwiZXhwb3J0cy5jb2RlID0gYHZhciBjYWNoZSA9IE1hcCgpO1xuXG5mdW5jdGlvbiBnZXRGYW5jeUVkaXRvcihlbGVtZW50KSB7XG4gIC8vIENoZWNrIGlmIGluIGNhY2hlIGFscmVhZHkuXG4gIHZhciBmYW5jeUVkaXRvciA9IGNhY2hlLmdldChlbGVtZW50KTtcbiAgaWYgKGZhbmN5RWRpdG9yKSB7XG4gICAgcmV0dXJuIGZhbmN5RWRpdG9yO1xuICB9XG5cbiAgLy8gTm90IGluIGNhY2hlLCBjcmVhdGUgYSBuZXcgb25lLlxuICBmYW5jeUVkaXRvciA9IG5ldyBGYW5jeUVkaXRvcihlbGVtZW50KTtcbiAgY2FjaGUuc2V0KGVsZW1lbnQsIGZhbmN5RWRpdG9yKTtcbiAgcmV0dXJuIGZhbmN5RWRpdG9yO1xufVxuXG52YXIgZWxBID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignI2NvbW1lbnQtYm94Jyk7XG52YXIgZWxCID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignI2FkbWluLWVkaXRvcicpO1xuXG52YXIgY29tbWVudEJveDEgPSBnZXRGYW5jeUVkaXRvcihlbEEpO1xudmFyIGNvbW1lbnRCb3gyID0gZ2V0RmFuY3lFZGl0b3IoZWxBKTtcblxudmFyIGNvbW1lbnRCb3gzID0gZ2V0RmFuY3lFZGl0b3IoZWxCKTtcbnZhciBjb21tZW50Qm94NCA9IGdldEZhbmN5RWRpdG9yKGVsQik7XG5cbmNvbW1lbnRCb3gxID0gdW5kZWZpbmVkO1xuY29tbWVudEJveDIgPSB1bmRlZmluZWQ7XG5jb21tZW50Qm94MyA9IHVuZGVmaW5lZDtcbmNvbW1lbnRCb3g0ID0gdW5kZWZpbmVkO1xuXG5lbEEucmVtb3ZlKCk7XG5lbEEgPSB1bmRlZmluZWQ7XG5lbEIucmVtb3ZlKCk7XG5lbEIgPSB1bmRlZmluZWQ7XG5gXG5cbmV4cG9ydHMuc3RlcHMgPSBbXG4gIFtcbiAgICBbXCJhZGROb2RlXCIsIHt0eXBlOiBcIndpbmRvd1wiLCBpZDogXCJ3aW5kb3dcIn1dLFxuICAgIFtcImFkZE5vZGVcIiwge3R5cGU6IFwiY2FsbFN0YWNrXCIsIGlkOiBcImNhbGxTdGFja1wifV0sXG4gIC8vIF0sXG4gIC8vIFtcbiAgICAvLyB2YXIgY2FjaGUgPSBNYXAoKTtcbiAgICBbXCJhZGROb2RlXCIsIHt0eXBlOiBcIk1hcFwiLCBkaXNwbGF5OiBcIk1hcFwiLCBpZDogXCJjYWNoZVwifV0sXG4gICAgW1wiYWRkTGlua1wiLCB7c291cmNlOiBcIndpbmRvd1wiLCB0YXJnZXQ6IFwiY2FjaGVcIiwgZGlzcGxheTogXCJjYWNoZVwifV0sXG4gICAgW1wiaGlnaGxpZ2h0XCIsIDFdLFxuICBdLFxuICBbXG4gICAgLy8gZnVuY3Rpb24gZ2V0RmFuY3lFZGl0b3IoZWxlbWVudCkgeyAuLi4gfVxuICAgIFtcImhpZ2hsaWdodFwiLCBbMywxNF1dLFxuICBdLFxuICBbXG4gICAgLy8gdmFyIGVsQSA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJyNjb21tZW50LWJveCcpO1xuICAgIFtcImhpZ2hsaWdodFwiLCAxNl0sXG4gICAgW1wiYWRkTm9kZVwiLCB7aWQ6IFwiZWxBXCIsIHR5cGU6IFwib2JqZWN0XCIsIFwiZGlzcGxheVwiOiBcIjwgPlwifV0sXG4gICAgW1wiYWRkTGlua1wiLCB7c291cmNlOiBcIndpbmRvd1wiLCB0YXJnZXQ6IFwiZWxBXCIsIGRpc3BsYXk6IFwiZWxBXCJ9XSxcbiAgXSxcbiAgW1xuICAgIC8vIHZhciBlbEIgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcjYWRtaW4tZWRpdG9yJyk7XG4gICAgW1wiaGlnaGxpZ2h0XCIsIDE3XSxcbiAgICBbXCJhZGROb2RlXCIsIHtpZDogXCJlbEJcIiwgdHlwZTogXCJvYmplY3RcIiwgXCJkaXNwbGF5XCI6IFwiPCA+XCJ9XSxcbiAgICBbXCJhZGRMaW5rXCIsIHtzb3VyY2U6IFwid2luZG93XCIsIHRhcmdldDogXCJlbEJcIiwgZGlzcGxheTogXCJlbEJcIn1dLFxuICBdLFxuXG4gIC8vLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gIC8vIENvbW1lbnQgQm94IDFcbiAgW1xuICAgIC8vIGdldEZhbmN5RWRpdG9yKGVsQSlcbiAgICBbXCJoaWdobGlnaHRcIiwgW1wiMTk6MTlcIiwgXCIxOTozOFwiXV0sXG4gICAgW1wiYWRkTm9kZVwiLCB7dHlwZTogXCJmdW5jdGlvblwiLCBkaXNwbGF5OiBcInNjb3BlXCIsIGlkOiBcInNjb3BlMVwifV0sXG4gICAgW1wiYWRkTGlua1wiLCB7c291cmNlOiBcImNhbGxTdGFja1wiLCB0YXJnZXQ6IFwic2NvcGUxXCIsIGRpc3BsYXk6IFwiZ2V0RmFuY3lFZGl0b3JcIn1dLFxuICBdLFxuICBbXG4gICAgLy8gZ2V0RmFuY3lFZGl0b3IoZWxlbWVudCkgYXJnc1xuICAgIFtcImhpZ2hsaWdodFwiLCBbXCIzOjI1XCIsIFwiMzozMlwiXV0sXG4gICAgW1wiYWRkTGlua1wiLCB7c291cmNlOiBcInNjb3BlMVwiLCB0YXJnZXQ6IFwiZWxBXCIsIGRhc2hlZDogdHJ1ZX1dLFxuICBdLFxuICBbXG4gICAgLy8gdmFyIGZhbmN5RWRpdG9yID0gY2FjaGUuZ2V0KGVsZW1lbnQpO1xuICAgIFtcImhpZ2hsaWdodFwiLCA1XSxcbiAgICBbXCJhZGROb2RlXCIsIHtpZDogXCJ1bmRlZmluZWQxXCIsIHR5cGU6IFwidmFsdWVcIiwgZGlzcGxheTogXCJ1bmRlZmluZWRcIn1dLFxuICAgIFtcImFkZExpbmtcIiwge3NvdXJjZTogXCJzY29wZTFcIiwgdGFyZ2V0OiBcInVuZGVmaW5lZDFcIiwgZGlzcGxheTogXCJmYW5jeUVkaXRvclwiLCBkaXN0YW5jZTogMS41fV0sXG4gIF0sXG4gIFtcbiAgICAvLyBpZiAoZmFuY3lFZGl0b3IpIHsgLi4uIH1cbiAgICBbXCJoaWdobGlnaHRcIiwgWzYsOF1dXG4gIF0sXG4gIFtcbiAgICAvLyBmYW5jeUVkaXRvciA9IG5ldyBGYW5jeUVkaXRvcihlbGVtZW50KTtcbiAgICBbXCJoaWdobGlnaHRcIiwgMTFdLFxuICAgIFtcInJlbW92ZU5vZGVcIiwgXCJ1bmRlZmluZWQxXCJdLFxuICAgIFtcImFkZE5vZGVcIiwge2lkOiBcImZhbmN5RWRpdG9yMVwiLCB0eXBlOiBcIm9iamVjdFwiLCBkaXNwbGF5OiBcIi4gLiAuLiBmYW5jeUVkaXRvclwiLCByYWRpdXM6IDN9XSxcbiAgICBbXCJhZGRMaW5rXCIsIHtzb3VyY2U6IFwic2NvcGUxXCIsIHRhcmdldDogXCJmYW5jeUVkaXRvcjFcIiwgZGlzcGxheTogXCJmYW5jeUVkaXRvclwiLCBkaXN0YW5jZTogMi41fV0sXG4gIF0sXG4gIFtcbiAgICAvLyBjYWNoZS5zZXQoZWxlbWVudCwgZmFuY3lFZGl0b3IpO1xuICAgIFtcImhpZ2hsaWdodFwiLCAxMl0sXG4gICAgW1wiYWRkTGlua1wiLCB7c291cmNlOiBcImNhY2hlXCIsIHRhcmdldDogXCJmYW5jeUVkaXRvcjFcIiwgZGlzcGxheTogXCI8ZWxBPiAgICAgXCIsIGRpc3RhbmNlOiAyLjV9XSxcbiAgICBbXCJhZGRMaW5rXCIsIHtzb3VyY2U6IFwiY2FjaGVcIiwgdGFyZ2V0OiBcImVsQVwiLCBkaXNwbGF5OiBcImtleVwifV0sXG4gIF0sXG4gIFtcbiAgICAvLyByZXR1cm4gZmFuY3lFZGl0b3I7XG4gICAgW1wiaGlnaGxpZ2h0XCIsIDEzXSxcbiAgXSxcbiAgW1xuICAgIC8vIHZhciBjb21tZW50Qm94MSA9IGdldEZhbmN5RWRpdG9yKGVsQSk7XG4gICAgW1wiaGlnaGxpZ2h0XCIsIDE5XSxcbiAgICBbXCJyZW1vdmVOb2RlXCIsIFwic2NvcGUxXCJdLFxuICAgIFtcImFkZExpbmtcIiwge3NvdXJjZTogXCJ3aW5kb3dcIiwgdGFyZ2V0OiBcImZhbmN5RWRpdG9yMVwiLCBkaXNwbGF5OiBcImNvbW1lbnRCb3gxXCIsIGRpc3RhbmNlOiAyLjV9XSxcbiAgXSxcblxuICAvLy0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAvLyBDb21tZW50IEJveCAyXG4gIFtcbiAgICAvLyBnZXRGYW5jeUVkaXRvcihlbEEpXG4gICAgW1wiaGlnaGxpZ2h0XCIsIFtcIjIwOjE5XCIsIFwiMjA6MzhcIl1dLFxuICAgIFtcImFkZE5vZGVcIiwge3R5cGU6IFwiZnVuY3Rpb25cIiwgZGlzcGxheTogXCJzY29wZVwiLCBpZDogXCJzY29wZTJcIn1dLFxuICAgIFtcImFkZExpbmtcIiwge3NvdXJjZTogXCJjYWxsU3RhY2tcIiwgdGFyZ2V0OiBcInNjb3BlMlwiLCBkaXNwbGF5OiBcImdldEZhbmN5RWRpdG9yXCJ9XSxcbiAgXSxcbiAgW1xuICAgIC8vIGdldEZhbmN5RWRpdG9yKGVsZW1lbnQpIGFyZ3NcbiAgICBbXCJoaWdobGlnaHRcIiwgW1wiMzoyNVwiLCBcIjM6MzJcIl1dLFxuICAgIFtcImFkZExpbmtcIiwge3NvdXJjZTogXCJzY29wZTJcIiwgdGFyZ2V0OiBcImVsQVwiLCBkYXNoZWQ6IHRydWV9XSxcbiAgXSxcbiAgW1xuICAgIC8vIHZhciBmYW5jeUVkaXRvciA9IGNhY2hlLmdldChlbGVtZW50KTtcbiAgICBbXCJoaWdobGlnaHRcIiwgNV0sXG4gICAgW1wiYWRkTGlua1wiLCB7c291cmNlOiBcInNjb3BlMlwiLCB0YXJnZXQ6IFwiZmFuY3lFZGl0b3IxXCIsIGRpc3BsYXk6IFwiZmFuY3lFZGl0b3JcIiwgZGlzdGFuY2U6IDIuNX1dLFxuICBdLFxuICBbXG4gICAgLy8gaWYgKGZhbmN5RWRpdG9yKSB7IC4uLiB9XG4gICAgW1wiaGlnaGxpZ2h0XCIsIFs2LDhdXVxuICBdLFxuICBbXG4gICAgLy8gcmV0dXJuIGZhbmN5RWRpdG9yO1xuICAgIFtcImhpZ2hsaWdodFwiLCA3XVxuICBdLFxuICBbXG4gICAgLy8gdmFyIGNvbW1lbnRCb3gyID0gZ2V0RmFuY3lFZGl0b3IoZWxBKTtcbiAgICBbXCJoaWdobGlnaHRcIiwgMjBdLFxuICAgIFtcInJlbW92ZU5vZGVcIiwgXCJzY29wZTJcIl0sXG4gICAgW1wicmVuYW1lTGlua1wiLCB7c291cmNlOiBcIndpbmRvd1wiLCB0YXJnZXQ6IFwiZmFuY3lFZGl0b3IxXCIsIGRpc3BsYXk6IFwiY29tbWVudEJveDEvMlwiLCBkaXN0YW5jZTogMi41fV0sXG4gIF0sXG5cbiAgLy8tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAvLyBSZW1haW5pbmcgY29tbWVudCBib3hlc1xuICBbXG4gICAgLy8gdmFyIGNvbW1lbnRCb3gzID0gZ2V0RmFuY3lFZGl0b3IoZWxCKTtcbiAgICAvLyB2YXIgY29tbWVudEJveDQgPSBnZXRGYW5jeUVkaXRvcihlbEIpO1xuICAgIFtcImFkZE5vZGVcIiwge2lkOiBcImZhbmN5RWRpdG9yMlwiLCB0eXBlOiBcIm9iamVjdFwiLCBkaXNwbGF5OiBcIi4gLiAuLiBmYW5jeUVkaXRvclwiLCByYWRpdXM6IDN9XSxcbiAgICBbXCJhZGRMaW5rXCIsIHtzb3VyY2U6IFwiY2FjaGVcIiwgdGFyZ2V0OiBcImZhbmN5RWRpdG9yMlwiLCBkaXNwbGF5OiBcIjxlbEI+ICAgICBcIiwgZGlzdGFuY2U6IDIuNX1dLFxuICAgIFtcImFkZExpbmtcIiwge3NvdXJjZTogXCJjYWNoZVwiLCB0YXJnZXQ6IFwiZWxCXCIsIGRpc3BsYXk6IFwia2V5XCJ9XSxcbiAgICBbXCJhZGRMaW5rXCIsIHtzb3VyY2U6IFwid2luZG93XCIsIHRhcmdldDogXCJmYW5jeUVkaXRvcjJcIiwgZGlzcGxheTogXCJjb21tZW50Qm94My80XCIsIGRpc3RhbmNlOiAyLjV9XSxcbiAgICBbXCJoaWdobGlnaHRcIiwgWzIyLCAyM11dLFxuICBdLFxuXG4gIFtcbiAgICAvL2NvbW1lbnRCb3gxLzIgPSB1bmRlZmluZWQ7XG4gICAgW1wicmVtb3ZlTGlua1wiLCBbXCJ3aW5kb3dcIiwgXCJmYW5jeUVkaXRvcjFcIl1dLFxuICAgIFtcImhpZ2hsaWdodFwiLCBbMjUsIDI2XV0sXG4gIF0sXG4gIFtcbiAgICAvLyBjb21tZW50Qm94My80ID0gdW5kZWZpbmVkO1xuICAgIFtcInJlbW92ZUxpbmtcIiwgW1wid2luZG93XCIsIFwiZmFuY3lFZGl0b3IyXCJdXSxcbiAgICBbXCJoaWdobGlnaHRcIiwgWzI3LCAyOF1dLFxuICBdLFxuICBbXG4gICAgW1wicmVtb3ZlTGlua1wiLCBbXCJ3aW5kb3dcIiwgXCJlbEFcIl1dLFxuICAgIFtcInJlbW92ZUxpbmtcIiwgW1wid2luZG93XCIsIFwiZWxCXCJdXSxcbiAgICBbXCJoaWdobGlnaHRcIiwgWzMwLCAzM11dLFxuICBdLFxuXVxuIiwiZXhwb3J0cy5jb2RlID0gYHZhciBjYWNoZSA9IFdlYWtNYXAoKTtcblxuZnVuY3Rpb24gZ2V0RmFuY3lFZGl0b3IoZWxlbWVudCkge1xuICAvLyBDaGVjayBpZiBpbiBjYWNoZSBhbHJlYWR5LlxuICB2YXIgZmFuY3lFZGl0b3IgPSBjYWNoZS5nZXQoZWxlbWVudCk7XG4gIGlmIChmYW5jeUVkaXRvcikge1xuICAgIHJldHVybiBmYW5jeUVkaXRvcjtcbiAgfVxuXG4gIC8vIE5vdCBpbiBjYWNoZSwgY3JlYXRlIGEgbmV3IG9uZS5cbiAgZmFuY3lFZGl0b3IgPSBuZXcgRmFuY3lFZGl0b3IoZWxlbWVudCk7XG4gIGNhY2hlLnNldChlbGVtZW50LCBmYW5jeUVkaXRvcik7XG4gIHJldHVybiBmYW5jeUVkaXRvcjtcbn1cblxudmFyIGVsQSA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJyNjb21tZW50LWJveCcpO1xudmFyIGVsQiA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJyNhZG1pbi1lZGl0b3InKTtcblxudmFyIGNvbW1lbnRCb3gxID0gZ2V0RmFuY3lFZGl0b3IoZWxBKTtcbnZhciBjb21tZW50Qm94MiA9IGdldEZhbmN5RWRpdG9yKGVsQSk7XG5cbnZhciBjb21tZW50Qm94MyA9IGdldEZhbmN5RWRpdG9yKGVsQik7XG52YXIgY29tbWVudEJveDQgPSBnZXRGYW5jeUVkaXRvcihlbEIpO1xuXG5jb21tZW50Qm94MSA9IHVuZGVmaW5lZDtcbmNvbW1lbnRCb3gyID0gdW5kZWZpbmVkO1xuY29tbWVudEJveDMgPSB1bmRlZmluZWQ7XG5jb21tZW50Qm94NCA9IHVuZGVmaW5lZDtcblxuZWxBLnJlbW92ZSgpO1xuZWxBID0gdW5kZWZpbmVkO1xuZWxCLnJlbW92ZSgpO1xuZWxCID0gdW5kZWZpbmVkO1xuYFxuXG5leHBvcnRzLnN0ZXBzID0gW1xuICBbXG4gICAgW1wiYWRkTm9kZVwiLCB7dHlwZTogXCJ3aW5kb3dcIiwgaWQ6IFwid2luZG93XCJ9XSxcbiAgICBbXCJhZGROb2RlXCIsIHt0eXBlOiBcImNhbGxTdGFja1wiLCBpZDogXCJjYWxsU3RhY2tcIn1dLFxuICAvLyBdLFxuICAvLyBbXG4gICAgLy8gdmFyIGNhY2hlID0gV2Vha01hcCgpO1xuICAgIFtcImFkZE5vZGVcIiwge3R5cGU6IFwiTWFwXCIsIGRpc3BsYXk6IFwiV2Vha01hcFwiLCBpZDogXCJjYWNoZVwifV0sXG4gICAgW1wiYWRkTGlua1wiLCB7c291cmNlOiBcIndpbmRvd1wiLCB0YXJnZXQ6IFwiY2FjaGVcIiwgZGlzcGxheTogXCJjYWNoZVwifV0sXG4gICAgW1wiaGlnaGxpZ2h0XCIsIDFdLFxuICBdLFxuICBbXG4gICAgLy8gRnVuY3Rpb24gZGVjbGFyYXRpb24gYW5kIGVsc1xuICAgIFtcImhpZ2hsaWdodFwiLCBbMywxN11dLFxuICAgIFtcImFkZE5vZGVcIiwge2lkOiBcImVsQVwiLCB0eXBlOiBcIm9iamVjdFwiLCBcImRpc3BsYXlcIjogXCI8ID5cIn1dLFxuICAgIFtcImFkZE5vZGVcIiwge2lkOiBcImVsQlwiLCB0eXBlOiBcIm9iamVjdFwiLCBcImRpc3BsYXlcIjogXCI8ID5cIn1dLFxuICAgIFtcImFkZExpbmtcIiwge3NvdXJjZTogXCJ3aW5kb3dcIiwgdGFyZ2V0OiBcImVsQVwiLCBkaXNwbGF5OiBcImVsQVwifV0sXG4gICAgW1wiYWRkTGlua1wiLCB7c291cmNlOiBcIndpbmRvd1wiLCB0YXJnZXQ6IFwiZWxCXCIsIGRpc3BsYXk6IFwiZWxCXCJ9XSxcbiAgXSxcblxuICAvLy0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAvLyBDb21tZW50IEJveCAxXG4gIFtcbiAgICAvLyB2YXIgY29tbWVudEJveDEgPSBnZXRGYW5jeUVkaXRvcihlbEEpO1xuICAgIC8vIHZhciBjb21tZW50Qm94MiA9IGdldEZhbmN5RWRpdG9yKGVsQSk7XG4gICAgW1wiYWRkTm9kZVwiLCB7aWQ6IFwiZmFuY3lFZGl0b3IxXCIsIHR5cGU6IFwib2JqZWN0XCIsIGRpc3BsYXk6IFwiLiAuIC4uIGZhbmN5RWRpdG9yXCIsIHJhZGl1czogM31dLFxuICAgIFtcImFkZExpbmtcIiwge3NvdXJjZTogXCJjYWNoZVwiLCB0YXJnZXQ6IFwiZmFuY3lFZGl0b3IxXCIsIGRpc3BsYXk6IFwiPGVsQT4gICAgIFwiLCBkaXN0YW5jZTogMi41LCBkYXNoZWQ6IHRydWV9XSxcbiAgICBbXCJhZGRMaW5rXCIsIHtzb3VyY2U6IFwiY2FjaGVcIiwgdGFyZ2V0OiBcImVsQVwiLCBkaXNwbGF5OiBcImtleVwiLCBkYXNoZWQ6IHRydWV9XSxcbiAgICBbXCJhZGRMaW5rXCIsIHtzb3VyY2U6IFwid2luZG93XCIsIHRhcmdldDogXCJmYW5jeUVkaXRvcjFcIiwgZGlzcGxheTogXCJjb21tZW50Qm94MS8yXCIsIGRpc3RhbmNlOiAyLjV9XSxcbiAgICBbXCJoaWdobGlnaHRcIiwgWzE5LCAyMF1dLFxuICBdLFxuXG4gIC8vLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgLy8gQ29tbWVudCBCb3ggMlxuICBbXG4gICAgLy8gdmFyIGNvbW1lbnRCb3gzID0gZ2V0RmFuY3lFZGl0b3IoZWxCKTtcbiAgICAvLyB2YXIgY29tbWVudEJveDQgPSBnZXRGYW5jeUVkaXRvcihlbEIpO1xuICAgIFtcImFkZE5vZGVcIiwge2lkOiBcImZhbmN5RWRpdG9yMlwiLCB0eXBlOiBcIm9iamVjdFwiLCBkaXNwbGF5OiBcIi4gLiAuLiBmYW5jeUVkaXRvclwiLCByYWRpdXM6IDN9XSxcbiAgICBbXCJhZGRMaW5rXCIsIHtzb3VyY2U6IFwiY2FjaGVcIiwgdGFyZ2V0OiBcImZhbmN5RWRpdG9yMlwiLCBkaXNwbGF5OiBcIjxlbEI+ICAgICBcIiwgZGlzdGFuY2U6IDIuNSwgZGFzaGVkOiB0cnVlfV0sXG4gICAgW1wiYWRkTGlua1wiLCB7c291cmNlOiBcImNhY2hlXCIsIHRhcmdldDogXCJlbEJcIiwgZGlzcGxheTogXCJrZXlcIiwgZGFzaGVkOiB0cnVlfV0sXG4gICAgW1wiYWRkTGlua1wiLCB7c291cmNlOiBcIndpbmRvd1wiLCB0YXJnZXQ6IFwiZmFuY3lFZGl0b3IyXCIsIGRpc3BsYXk6IFwiY29tbWVudEJveDMvNFwiLCBkaXN0YW5jZTogMi41fV0sXG4gICAgW1wiaGlnaGxpZ2h0XCIsIFsyMiwgMjNdXSxcbiAgXSxcbiAgW1xuICAgIFtcInJlbW92ZUxpbmtcIiwgW1wid2luZG93XCIsIFwiZmFuY3lFZGl0b3IxXCJdXSxcbiAgICBbXCJoaWdobGlnaHRcIiwgWzI1LCAyNl1dLFxuICBdLFxuICBbXG4gICAgW1wicmVtb3ZlTGlua1wiLCBbXCJ3aW5kb3dcIiwgXCJmYW5jeUVkaXRvcjJcIl1dLFxuICAgIFtcImhpZ2hsaWdodFwiLCBbMjcsIDI4XV0sXG4gIF0sXG4gIFtcbiAgICBbXCJyZW1vdmVMaW5rXCIsIFtcIndpbmRvd1wiLCBcImVsQVwiXV0sXG4gICAgW1wicmVtb3ZlTGlua1wiLCBbXCJ3aW5kb3dcIiwgXCJlbEJcIl1dLFxuICAgIFtcImhpZ2hsaWdodFwiLCBbMzAsIDMzXV0sXG4gIF0sXG4gIFtcbiAgICBbXCJyZW1vdmVOb2RlXCIsIFwiZmFuY3lFZGl0b3IxXCJdLFxuICBdLFxuICBbXG4gICAgW1wicmVtb3ZlTm9kZVwiLCBcImVsQVwiXSxcbiAgXSxcbiAgW1xuICAgIFtcInJlbW92ZU5vZGVcIiwgXCJmYW5jeUVkaXRvcjJcIl0sXG4gIF0sXG4gIFtcbiAgICBbXCJyZW1vdmVOb2RlXCIsIFwiZWxCXCJdLFxuICBdLFxuXVxuIiwiZXhwb3J0cy5HUk9VUCA9IE9iamVjdC5mcmVlemUoe1xuICB3aW5kb3c6IDAsXG4gIGFycmF5OiAxLFxuICBvYmplY3Q6IDIsXG4gIGZ1bmN0aW9uOiAzLFxuICB2YWx1ZTogNCxcbiAgY2FsbFN0YWNrOiA1LFxuICBNYXA6IDYsXG59KVxuXG5leHBvcnRzLlNJWkUgPSBPYmplY3QuZnJlZXplKHtcbiAgd2luZG93OiA0LFxuICBjYWxsU3RhY2s6IDMsXG4gIGZ1bmN0aW9uOiAzLFxuICBhcnJheTogMixcbiAgb2JqZWN0OiAyLFxuICBNYXA6IDIsXG4gIHZhbHVlOiAxXG59KVxuXG5leHBvcnRzLkxFTkdUSCA9IE9iamVjdC5mcmVlemUoe1xuICB3aW5kb3c6IDEwLFxuICBjYWxsU3RhY2s6IDEwLFxuICBmdW5jdGlvbjogMTAsXG4gIGFycmF5OiAyLFxuICBvYmplY3Q6IDIsXG4gIE1hcDogMixcbiAgdmFsdWU6IDAuM1xufSlcbiIsIm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gdHlwZSAoZ3JhcGgsIGNvZGUpIHtcbiAgY29uc3QgY29udGFpbmVyID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLmVkaXRvcicpXG4gIGdyYXBoLmVkaXRvciA9IENvZGVNaXJyb3IoY29udGFpbmVyLCB7XG4gICAgdmFsdWU6IGNvZGUgfHwgXCIvLyBObyBjb2RlIHByb3ZpZGVkXCIsXG4gICAgbW9kZTogXCJqYXZhc2NyaXB0XCIsXG4gICAgbGluZU51bWJlcnM6IHRydWVcbiAgfSlcblxuICBncmFwaC5kZXN0cm95LnB1c2goKCkgPT4gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLkNvZGVNaXJyb3InKS5yZW1vdmUoKSlcbn1cbiIsImNvbnN0IHsgR1JPVVAsIFNJWkUsIExFTkdUSCB9ID0gcmVxdWlyZSgnLi9jb25zdGFudHMnKVxuY29uc3QgYWN0aW9uU3RlcHBlciA9IHJlcXVpcmUoJy4vYWN0aW9uLXN0ZXBwZXInKVxuY29uc3Qgc3RhcnRFZGl0b3IgPSByZXF1aXJlKCcuL2VkaXRvcicpXG5cbi8vIGNvbnN0IHsgbm9kZXMsIGxpbmtzIH0gPSByZXF1aXJlKCcuL2FjdGlvbnMvZGVtbycpXG4vLyBjb25zdCBkZW1vID0gcmVxdWlyZSgnLi9hY3Rpb25zL2Jhc2ljcycpXG4vLyBjb25zdCBkZW1vID0gcmVxdWlyZSgnLi9hY3Rpb25zL2NyZWF0ZS10ZW4tZWxlbWVudHMnKVxuLy8gY29uc3QgZGVtbyA9IHJlcXVpcmUoJy4vYWN0aW9ucy9oYW5kbGVyLWxlYWsnKVxuLy8gY29uc3QgZGVtbyA9IHJlcXVpcmUoJy4vYWN0aW9ucy9oYW5kbGVyLWxlYWstZml4JylcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBzdGFydChkZW1vKSB7XG4gIGNvbnN0IGdyYXBoID0gbmV3IE1lbW9yeUdyYXBoKGRlbW8pXG5cbiAgc3RhcnRFZGl0b3IoZ3JhcGgsIGRlbW8uY29kZSlcbiAgc2V0dXBGb3JjZVRpY2soZ3JhcGgpLFxuICBhZGRLZXlib2FyZExpc3RlbmVyKGdyYXBoKSxcbiAgYWRkUmVzaXplTGlzdGVuZXIoZ3JhcGgsIGdyYXBoLmZvcmNlLCBncmFwaC5lbClcblxuICByZXR1cm4gZnVuY3Rpb24gZGVzdHJveVZpc3VhbGl6YXRpb24oKSB7XG4gICAgZ3JhcGguZGVzdHJveS5mb3JFYWNoKGZuID0+IGZuKCkpXG4gIH1cbn1cblxuZnVuY3Rpb24gTWVtb3J5R3JhcGgoe3N0ZXBzLCBsaW5lTGVuZ3RofSkge1xuICBjb25zdCBlbCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5ub2RlJylcbiAgdGhpcy5lbCA9IGVsXG4gIHRoaXMuc3ZnID0gZDMuc2VsZWN0KFwiLm5vZGVcIilcbiAgICAuYXBwZW5kKFwic3ZnXCIpXG4gICAgLmF0dHIoXCJ3aWR0aFwiLCBlbC5vZmZzZXRXaWR0aClcbiAgICAuYXR0cihcImhlaWdodFwiLCBlbC5vZmZzZXRIZWlnaHQpXG5cbiAgdGhpcy5zdmdcbiAgICAuYXBwZW5kKFwiZGVmc1wiKVxuICAgICAgLmFwcGVuZChcIm1hcmtlclwiKVxuICAgICAgICAuYXR0cihcImlkXCIsIFwiYXJyb3dcIilcbiAgICAgICAgLmF0dHIoXCJtYXJrZXJXaWR0aFwiLCBcIjEzXCIpXG4gICAgICAgIC5hdHRyKFwibWFya2VySGVpZ2h0XCIsIFwiMTNcIilcbiAgICAgICAgLmF0dHIoXCJvcmllbnRcIiwgXCJhdXRvXCIpXG4gICAgICAgIC5hdHRyKFwicmVmWFwiLCBcIjJcIilcbiAgICAgICAgLmF0dHIoXCJyZWZZXCIsIFwiNlwiKVxuICAgICAgICAuYXBwZW5kKFwicGF0aFwiKVxuICAgICAgICAgIC5hdHRyKFwiZFwiLCBcIk0yLDIgTDIsMTEgTDEwLDYgTDIsMlwiKVxuICAgICAgICAgIC5zdHlsZShcImZpbGxcIiwgXCIjY2NjXCIpXG5cblxuICB0aGlzLmNvbG9yID0gZDMuc2NhbGUuY2F0ZWdvcnkyMCgpXG5cbiAgdGhpcy5saW5lTGVuZ3RoID0gbGluZUxlbmd0aCB8fCA1MFxuICB0aGlzLmZvcmNlID0gZDMubGF5b3V0LmZvcmNlKClcbiAgICAgIC5ncmF2aXR5KDAuMDUpXG4gICAgICAuZGlzdGFuY2UoZCA9PiBTSVpFW2QudGFyZ2V0LnR5cGVdICogNTApXG4gICAgICAuY2hhcmdlKC0xMDApXG4gICAgICAuc2l6ZShbZWwub2Zmc2V0V2lkdGgsIGVsLm9mZnNldEhlaWdodF0pXG5cbiAgdGhpcy4kbGluayA9IHRoaXMuc3ZnLmFwcGVuZChcImdcIikuc2VsZWN0QWxsKFwiLmxpbmtcIilcbiAgdGhpcy4kbm9kZSA9IHRoaXMuc3ZnLmFwcGVuZChcImdcIikuc2VsZWN0QWxsKFwiLm5vZGVcIilcbiAgdGhpcy5ub2RlcyA9IFtdXG4gIHRoaXMubGlua3MgPSBbXVxuICB0aGlzLnN0ZXBzSnNvbiA9IHN0ZXBzXG4gIHRoaXMuZGVzdHJveSA9IFsoKSA9PiB7XG4gICAgdGhpcy5zdmcucmVtb3ZlKClcbiAgICB0aGlzLmZvcmNlLnN0b3AoKVxuICB9XVxufVxuXG5mdW5jdGlvbiBydW5TdGVwKGdyYXBoLCBpKSB7XG4gIGdyYXBoLmVkaXRvci5nZXRBbGxNYXJrcygpLmZvckVhY2gobWFyayA9PiBtYXJrLmNsZWFyKCkpXG4gIGdyYXBoLnN0ZXBzSnNvbltpXS5mb3JFYWNoKChbYWN0aW9uLCB2YWx1ZV0pID0+IHtcbiAgICBhY3Rpb25TdGVwcGVyW2FjdGlvbl0oZ3JhcGgsIHZhbHVlKVxuICB9KVxufVxuXG5mdW5jdGlvbiBydW5TdGVwc1RvKGdyYXBoLCBpKSB7XG4gIGdyYXBoLm5vZGVzID0gW11cbiAgZ3JhcGgubGlua3MgPSBbXVxuICBmb3IobGV0IGo9MDsgaiA8PSBpOyBqKyspIHJ1blN0ZXAoZ3JhcGgsIGopXG59XG5cbmZ1bmN0aW9uIGFkZEtleWJvYXJkTGlzdGVuZXIoZ3JhcGgpIHtcbiAgY29uc3QgS0VZX1JJR0hUID0gMzlcbiAgY29uc3QgS0VZX0xFRlQgPSAzN1xuICBsZXQgY3VycmVudFN0ZXAgPSAwXG4gIGxldCB7bm9kZXMsIHN0ZXBzSnNvbiwgZm9yY2V9ID0gZ3JhcGhcblxuICBydW5TdGVwc1RvKGdyYXBoLCBjdXJyZW50U3RlcClcbiAgdXBkYXRlVmlldyhncmFwaClcblxuICBjb25zdCBoYW5kbGVyID0gZSA9PiB7XG4gICAgaWYoZS5rZXlDb2RlID09PSBLRVlfUklHSFQpIHtcbiAgICAgIGNvbnN0IG5leHRTdGVwID0gTWF0aC5taW4oY3VycmVudFN0ZXAgKyAxLCBzdGVwc0pzb24ubGVuZ3RoIC0gMSlcbiAgICAgIGlmIChuZXh0U3RlcCAhPT0gY3VycmVudFN0ZXApIHtcbiAgICAgICAgY3VycmVudFN0ZXAgPSBuZXh0U3RlcFxuICAgICAgICBydW5TdGVwKGdyYXBoLCBjdXJyZW50U3RlcClcbiAgICAgICAgdXBkYXRlVmlldyhncmFwaClcbiAgICAgIH1cbiAgICB9IGVsc2UgaWYoZS5rZXlDb2RlID09PSBLRVlfTEVGVCkge1xuICAgICAgY29uc3QgbmV4dFN0ZXAgPSBNYXRoLm1heChjdXJyZW50U3RlcCAtIDEsIDApXG4gICAgICBpZiAobmV4dFN0ZXAgIT09IGN1cnJlbnRTdGVwKSB7XG4gICAgICAgIGN1cnJlbnRTdGVwID0gbmV4dFN0ZXBcbiAgICAgICAgcnVuU3RlcHNUbyhncmFwaCwgY3VycmVudFN0ZXApXG4gICAgICAgIHVwZGF0ZVZpZXcoZ3JhcGgpXG4gICAgICB9XG4gICAgfVxuICB9XG4gIC8vIE1vdmUgdGhlIGdyYXBoIHN0ZXAgbGVmdCBvciByaWdodCBieSBrZXlib2FyZFxuICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcigna2V5dXAnLCBoYW5kbGVyKVxuICBncmFwaC5kZXN0cm95LnB1c2goKCkgPT4gd2luZG93LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ2tleXVwJywgaGFuZGxlcikpXG59XG5cbmZ1bmN0aW9uIGFkZFJlc2l6ZUxpc3RlbmVyIChncmFwaCwgZm9yY2UsIGVsKSB7XG4gIGNvbnN0IGhhbmRsZXIgPSAoKSA9PiB7XG4gICAgZDMuc2VsZWN0KFwic3ZnXCIpXG4gICAgICAuYXR0cihcIndpZHRoXCIsIGVsLm9mZnNldFdpZHRoKVxuICAgICAgLmF0dHIoXCJoZWlnaHRcIiwgZWwub2Zmc2V0SGVpZ2h0KVxuXG4gICAgZm9yY2Uuc2l6ZShbZWwub2Zmc2V0V2lkdGgsIGVsLm9mZnNldEhlaWdodF0pXG4gIH1cbiAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ3Jlc2l6ZScsIGhhbmRsZXIpXG4gIGdyYXBoLmRlc3Ryb3kucHVzaCgoKSA9PiB3aW5kb3cucmVtb3ZlRXZlbnRMaXN0ZW5lcigncmVzaXplJywgaGFuZGxlcikpXG59XG5cbmZ1bmN0aW9uIGdldE5vZGVSYWRpdXMgKG5vZGUpIHtcbiAgcmV0dXJuIDUgKiBTSVpFW25vZGUudHlwZV0gKiAobm9kZS5yYWRpdXMgfHwgMSlcbn1cblxuZnVuY3Rpb24gdXBkYXRlVmlldyhncmFwaCkge1xuICBjb25zdCB7IGZvcmNlLCBjb2xvciwgbm9kZXMsIGxpbmtzLCBlbCwgbGluZUxlbmd0aCB9ID0gZ3JhcGhcblxuICAvLyBVcGRhdGUgdGhlIGdyYXBoJ3Mgc2VsZWN0aW9ucyB3aXRoIHRoZSBjaGFuZ2VkIGRhdGFcbiAgY29uc3QgJG5vZGUgPSBncmFwaC4kbm9kZS5kYXRhKG5vZGVzKVxuICBjb25zdCAkbGluayA9IGdyYXBoLiRsaW5rLmRhdGEobGlua3MpXG4gIGdyYXBoLiRub2RlID0gJG5vZGVcbiAgZ3JhcGguJGxpbmsgPSAkbGlua1xuXG4gIC8vIFVwZGF0ZSBET00gbm9kZXMnIGJhc2UgZ3JvdXBcbiAgJG5vZGUuZW50ZXIoKS5hcHBlbmQoXCJnXCIpXG4gICRsaW5rLmVudGVyKCkuYXBwZW5kKFwiZ1wiKVxuICAkbm9kZS5leGl0KCkucmVtb3ZlKClcbiAgJGxpbmsuZXhpdCgpLnJlbW92ZSgpXG4gICRub2RlLmh0bWwoXCJcIilcbiAgJGxpbmsuaHRtbChcIlwiKVxuXG4gICRub2RlLmF0dHIoXCJjbGFzc1wiLCBcIm5vZGVcIilcbiAgICAuY2FsbChmb3JjZS5kcmFnKVxuXG4gICRub2RlLmFwcGVuZChcImNpcmNsZVwiKVxuICAgIC5hdHRyKFwiY2xhc3NcIiwgXCJub2RlLWNpcmNsZVwiKVxuICAgIC5hdHRyKFwiclwiLCBkID0+IGdldE5vZGVSYWRpdXMoZCkpXG4gICAgLnN0eWxlKFwiZmlsbFwiLCBkID0+IGNvbG9yKEdST1VQW2QudHlwZV0pKVxuXG4gICRub2RlLmFwcGVuZChcInRleHRcIilcbiAgICAuYXR0cihcImNsYXNzXCIsIFwibm9kZS10ZXh0XCIpXG4gICAgLmF0dHIoXCJkeFwiLCBkID0+IDUgKyA0ICogU0laRVtkLnR5cGVdKVxuICAgIC5hdHRyKFwiZHlcIiwgXCIuMzVlbVwiKVxuICAgIC5zdHlsZShcImZpbGxcIiwgZCA9PiBjb2xvcihHUk9VUFtkLnR5cGVdKSlcbiAgICAvLyBQcmlvcml0eSBvcmRlciBmb3IgdGV4dCBub2RlcywgYWxsb3cgdGhlbSB0byBiZSByZW5hbWVkLCBvciB1c2UgdGhlXG4gICAgLy8gZGlzcGxheSBuYW1lLiBJZiBub25lIG9mIHRob3NlIGV4aXN0IGp1c3QgdXNlIHRoZSBub2RlIG5hbWUgdHlwZS5cbiAgICAudGV4dChkID0+IGQucmVuYW1lIHx8IGQuZGlzcGxheSB8fCBkLnR5cGUpXG5cbiAgJGxpbmsuYXBwZW5kKFwibGluZVwiKVxuICAgIC5hdHRyKFwiY2xhc3NcIiwgXCJsaW5rXCIpXG4gICAgLmF0dHIoXCJzdHJva2UtZGFzaGFycmF5XCIsICh7ZGFzaGVkfSkgPT4gZGFzaGVkID8gXCI1LCA1XCIgOiBmYWxzZSlcbiAgICAuc3R5bGUoXCJtYXJrZXItZW5kXCIsIFwidXJsKCNhcnJvdylcIilcblxuICAkbGluay5hcHBlbmQoXCJ0ZXh0XCIpXG4gICAgLmF0dHIoXCJjbGFzc1wiLCBcImVkZ2UtdGV4dFwiKVxuICAgIC5hdHRyKFwiZHlcIiwgXCItLjM1ZW1cIilcbiAgICAudGV4dChkID0+IGQucmVuYW1lIHx8IGQuZGlzcGxheSB8fCBcIlwiKVxuXG4gIC8vIFJlc3RhcnQgZm9yY2UgZ3JhcGhcbiAgZm9yY2VcbiAgICAubm9kZXMobm9kZXMpXG4gICAgLmxpbmtzKGxpbmtzKVxuICAgIC5mcmljdGlvbigwLjgpXG4gICAgLmNoYXJnZSgtNjAwKVxuICAgIC5ncmF2aXR5KDAuMSlcbiAgICAubGlua0Rpc3RhbmNlKGQgPT4ge1xuICAgICAgcmV0dXJuIExFTkdUSFtkLnRhcmdldC50eXBlXSAqIGVsLm9mZnNldEhlaWdodCAvIDYwICsgbGluZUxlbmd0aCAqIChkLmRpc3RhbmNlIHx8IDEpXG4gICAgfSlcbiAgICAvLyAubGlua1N0cmVuZ3RoKDAuMDEpXG4gICAgLy8gLnRoZXRhKDAuOClcbiAgICAvLyAuYWxwaGEoMC4xKVxuICAgIC5zdGFydCgpXG59XG5cbmZ1bmN0aW9uIHNob3J0ZW5MaW5rcyhsaW5rLCBmaXJzdCkge1xuICBjb25zdCBBUlJPV19PRkZTRVQgPSA4XG4gIGxldCByYWRpdXMgPSBnZXROb2RlUmFkaXVzKGxpbmsudGFyZ2V0KVxuICBsZXQgeCA9IGxpbmsudGFyZ2V0LnggLSBsaW5rLnNvdXJjZS54XG4gIGxldCB5ID0gbGluay50YXJnZXQueSAtIGxpbmsuc291cmNlLnlcbiAgbGV0IGRpc3RhbmNlID0gTWF0aC5zcXJ0KHgqeCArIHkqeSlcbiAgbGV0IHRoZXRhID0gTWF0aC5hdGFuMih5LHgpXG4gIGlmKGZpcnN0KSB7XG4gICAgcmV0dXJuIGxpbmsuc291cmNlLnggKyBNYXRoLmNvcyh0aGV0YSkgKiAoZGlzdGFuY2UgLSByYWRpdXMgLSBBUlJPV19PRkZTRVQpXG4gIH0gZWxzZSB7XG4gICAgcmV0dXJuIGxpbmsuc291cmNlLnkgKyBNYXRoLnNpbih0aGV0YSkgKiAoZGlzdGFuY2UgLSByYWRpdXMgLSBBUlJPV19PRkZTRVQpXG4gIH1cbn1cblxuZnVuY3Rpb24gc2V0dXBGb3JjZVRpY2sgKGdyYXBoKSB7XG4gIGdyYXBoLmZvcmNlLm9uKFwidGlja1wiLCAoKSA9PiB7XG4gICAgZ3JhcGguJG5vZGUuYXR0cihcInRyYW5zZm9ybVwiLCAoZCkgPT4gYHRyYW5zbGF0ZSgke2QueH0sJHtkLnl9KWApXG4gICAgZ3JhcGguJGxpbmsuc2VsZWN0KCdsaW5lJylcbiAgICAgIC5hdHRyKFwieDFcIiwgZCA9PiBkLnNvdXJjZS54KVxuICAgICAgLmF0dHIoXCJ5MVwiLCBkID0+IGQuc291cmNlLnkpXG4gICAgICAuYXR0cihcIngyXCIsIGQgPT4gc2hvcnRlbkxpbmtzKGQsIHRydWUpKVxuICAgICAgLmF0dHIoXCJ5MlwiLCBkID0+IHNob3J0ZW5MaW5rcyhkLCBmYWxzZSkpXG5cbiAgICBncmFwaC4kbGluay5zZWxlY3QoJ3RleHQnKVxuICAgICAgLnN0eWxlKFwidHJhbnNmb3JtXCIsIGQgPT4ge1xuICAgICAgICBsZXQgeCA9IChkLnNvdXJjZS54ICsgZC50YXJnZXQueCkgLyAyXG4gICAgICAgIGxldCB5ID0gKGQuc291cmNlLnkgKyBkLnRhcmdldC55KSAvIDJcbiAgICAgICAgbGV0IGR4ID0gZC50YXJnZXQueCAtIGQuc291cmNlLnhcbiAgICAgICAgbGV0IGR5ID0gZC50YXJnZXQueSAtIGQuc291cmNlLnlcbiAgICAgICAgbGV0IHRoZXRhID0gTWF0aC5hdGFuMihkeSxkeClcbiAgICAgICAgcmV0dXJuIGB0cmFuc2xhdGUoJHt4fXB4LCAke3l9cHgpIHJvdGF0ZSgke3RoZXRhfXJhZClgXG4gICAgICB9KVxuICB9KVxufVxuIiwiY29uc3QgY3Jvc3Nyb2FkcyA9IHJlcXVpcmUoJ2Nyb3Nzcm9hZHMnKTtcbmNvbnN0IGhhc2hlciA9IHJlcXVpcmUoJ2hhc2hlcicpO1xuY29uc3Qgc3RhcnRWaXN1YWxpemF0aW9uID0gcmVxdWlyZSgnLi92aXN1YWxpemF0aW9uJylcbmNvbnN0IGFjdGlvbnMgPSByZXF1aXJlKCcuL2FjdGlvbnMnKVxuXG5sZXQgZGVzdHJveVByZXZpb3VzVmlzdWFsaXphdGlvbiA9ICgpID0+IHt9XG5cbmZ1bmN0aW9uIHBhcnNlSGFzaCAobmV3SGFzaCwgb2xkSGFzaCkge1xuICBjcm9zc3JvYWRzLnBhcnNlKG5ld0hhc2gpO1xufVxuXG5jcm9zc3JvYWRzLmFkZFJvdXRlKCcve25hbWV9JywgKG5hbWUpID0+IHtcbiAgaWYoIWFjdGlvbnNbbmFtZV0pIHtcbiAgICBhbGVydChcIkNvdWxkIG5vdCBmaW5kIHRoYXQgcGFnZS5cIilcbiAgICBoYXNoZXIucmVwbGFjZUhhc2goJycpO1xuICAgIHJldHVyblxuICB9XG4gIGRlc3Ryb3lQcmV2aW91c1Zpc3VhbGl6YXRpb24oKVxuICBkZXN0cm95UHJldmlvdXNWaXN1YWxpemF0aW9uID0gc3RhcnRWaXN1YWxpemF0aW9uKGFjdGlvbnNbbmFtZV0pXG59KTtcblxuY3Jvc3Nyb2Fkcy5hZGRSb3V0ZSgvLiovLCAoKSA9PiB7XG4gIGNvbnNvbGUubG9nKCdtYWluIHJvdXRlJylcbiAgY29uc3QgY29udGFpbmVyID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLm5vZGUnKVxuICBjb250YWluZXIuaW5uZXJIVE1MID0gYFxuICAgIDxoMSBjbGFzcz0ndGl0bGUtaGVhZGVyJz5VbmRlcnN0YW5kaW5nIE1lbW9yeSBpbiBKYXZhU2NyaXB0PC9oMT5cbiAgICA8cCBjbGFzcz0ndGl0bGUtc3ViaGVhZGVyJz5ieSBHcmVnIFRhdHVtPC9wPlxuICBgXG5cbiAgT2JqZWN0LmtleXMoYWN0aW9ucykuZm9yRWFjaChrZXkgPT4ge1xuICAgIGNvbnN0IGRpdiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpXG4gICAgZGl2LmlubmVySFRNTCA9IGBcbiAgICAgIDxhIGhyZWY9JyMvJHtrZXl9JyBjbGFzcz0ndGl0bGUtbGluayc+JHtrZXl9PC9hPjxici8+XG4gICAgYFxuICAgIGNvbnRhaW5lci5hcHBlbmRDaGlsZChkaXYpXG4gIH0pXG4gIGRlc3Ryb3lQcmV2aW91c1Zpc3VhbGl6YXRpb24oKVxuICBkZXN0cm95UHJldmlvdXNWaXN1YWxpemF0aW9uID0gKCkgPT4ge1xuICAgIGNvbnN0IGVscyA9IEFycmF5LmZyb20oZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnLm5vZGUgPiAqJykpXG4gICAgZWxzLmZvckVhY2goZWwgPT4gZWwucmVtb3ZlKCkpXG4gIH1cbn0pO1xuXG5oYXNoZXIuaW5pdGlhbGl6ZWQuYWRkKHBhcnNlSGFzaCk7IC8vIHBhcnNlIGluaXRpYWwgaGFzaFxuaGFzaGVyLmNoYW5nZWQuYWRkKHBhcnNlSGFzaCk7IC8vcGFyc2UgaGFzaCBjaGFuZ2VzXG5oYXNoZXIuaW5pdCgpOyAvL3N0YXJ0IGxpc3RlbmluZyBmb3IgaGlzdG9yeSBjaGFuZ2VcbiJdfQ==
