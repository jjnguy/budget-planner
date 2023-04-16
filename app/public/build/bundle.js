
(function(l, r) { if (!l || l.getElementById('livereloadscript')) return; r = l.createElement('script'); r.async = 1; r.src = '//' + (self.location.host || 'localhost').split(':')[0] + ':35729/livereload.js?snipver=1'; r.id = 'livereloadscript'; l.getElementsByTagName('head')[0].appendChild(r) })(self.document);
var app = (function () {
    'use strict';

    function noop() { }
    function add_location(element, file, line, column, char) {
        element.__svelte_meta = {
            loc: { file, line, column, char }
        };
    }
    function run(fn) {
        return fn();
    }
    function blank_object() {
        return Object.create(null);
    }
    function run_all(fns) {
        fns.forEach(run);
    }
    function is_function(thing) {
        return typeof thing === 'function';
    }
    function safe_not_equal(a, b) {
        return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
    }
    function is_empty(obj) {
        return Object.keys(obj).length === 0;
    }
    function append(target, node) {
        target.appendChild(node);
    }
    function insert(target, node, anchor) {
        target.insertBefore(node, anchor || null);
    }
    function detach(node) {
        if (node.parentNode) {
            node.parentNode.removeChild(node);
        }
    }
    function destroy_each(iterations, detaching) {
        for (let i = 0; i < iterations.length; i += 1) {
            if (iterations[i])
                iterations[i].d(detaching);
        }
    }
    function element(name) {
        return document.createElement(name);
    }
    function text(data) {
        return document.createTextNode(data);
    }
    function space() {
        return text(' ');
    }
    function listen(node, event, handler, options) {
        node.addEventListener(event, handler, options);
        return () => node.removeEventListener(event, handler, options);
    }
    function prevent_default(fn) {
        return function (event) {
            event.preventDefault();
            // @ts-ignore
            return fn.call(this, event);
        };
    }
    function attr(node, attribute, value) {
        if (value == null)
            node.removeAttribute(attribute);
        else if (node.getAttribute(attribute) !== value)
            node.setAttribute(attribute, value);
    }
    function to_number(value) {
        return value === '' ? null : +value;
    }
    function children(element) {
        return Array.from(element.childNodes);
    }
    function set_input_value(input, value) {
        input.value = value == null ? '' : value;
    }
    function select_option(select, value, mounting) {
        for (let i = 0; i < select.options.length; i += 1) {
            const option = select.options[i];
            if (option.__value === value) {
                option.selected = true;
                return;
            }
        }
        if (!mounting || value !== undefined) {
            select.selectedIndex = -1; // no option should be selected
        }
    }
    function select_value(select) {
        const selected_option = select.querySelector(':checked');
        return selected_option && selected_option.__value;
    }
    function custom_event(type, detail, { bubbles = false, cancelable = false } = {}) {
        const e = document.createEvent('CustomEvent');
        e.initCustomEvent(type, bubbles, cancelable, detail);
        return e;
    }

    let current_component;
    function set_current_component(component) {
        current_component = component;
    }
    function get_current_component() {
        if (!current_component)
            throw new Error('Function called outside component initialization');
        return current_component;
    }
    /**
     * Creates an event dispatcher that can be used to dispatch [component events](/docs#template-syntax-component-directives-on-eventname).
     * Event dispatchers are functions that can take two arguments: `name` and `detail`.
     *
     * Component events created with `createEventDispatcher` create a
     * [CustomEvent](https://developer.mozilla.org/en-US/docs/Web/API/CustomEvent).
     * These events do not [bubble](https://developer.mozilla.org/en-US/docs/Learn/JavaScript/Building_blocks/Events#Event_bubbling_and_capture).
     * The `detail` argument corresponds to the [CustomEvent.detail](https://developer.mozilla.org/en-US/docs/Web/API/CustomEvent/detail)
     * property and can contain any type of data.
     *
     * https://svelte.dev/docs#run-time-svelte-createeventdispatcher
     */
    function createEventDispatcher() {
        const component = get_current_component();
        return (type, detail, { cancelable = false } = {}) => {
            const callbacks = component.$$.callbacks[type];
            if (callbacks) {
                // TODO are there situations where events could be dispatched
                // in a server (non-DOM) environment?
                const event = custom_event(type, detail, { cancelable });
                callbacks.slice().forEach(fn => {
                    fn.call(component, event);
                });
                return !event.defaultPrevented;
            }
            return true;
        };
    }
    // TODO figure out if we still want to support
    // shorthand events, or if we want to implement
    // a real bubbling mechanism
    function bubble(component, event) {
        const callbacks = component.$$.callbacks[event.type];
        if (callbacks) {
            // @ts-ignore
            callbacks.slice().forEach(fn => fn.call(this, event));
        }
    }

    const dirty_components = [];
    const binding_callbacks = [];
    let render_callbacks = [];
    const flush_callbacks = [];
    const resolved_promise = /* @__PURE__ */ Promise.resolve();
    let update_scheduled = false;
    function schedule_update() {
        if (!update_scheduled) {
            update_scheduled = true;
            resolved_promise.then(flush);
        }
    }
    function add_render_callback(fn) {
        render_callbacks.push(fn);
    }
    function add_flush_callback(fn) {
        flush_callbacks.push(fn);
    }
    // flush() calls callbacks in this order:
    // 1. All beforeUpdate callbacks, in order: parents before children
    // 2. All bind:this callbacks, in reverse order: children before parents.
    // 3. All afterUpdate callbacks, in order: parents before children. EXCEPT
    //    for afterUpdates called during the initial onMount, which are called in
    //    reverse order: children before parents.
    // Since callbacks might update component values, which could trigger another
    // call to flush(), the following steps guard against this:
    // 1. During beforeUpdate, any updated components will be added to the
    //    dirty_components array and will cause a reentrant call to flush(). Because
    //    the flush index is kept outside the function, the reentrant call will pick
    //    up where the earlier call left off and go through all dirty components. The
    //    current_component value is saved and restored so that the reentrant call will
    //    not interfere with the "parent" flush() call.
    // 2. bind:this callbacks cannot trigger new flush() calls.
    // 3. During afterUpdate, any updated components will NOT have their afterUpdate
    //    callback called a second time; the seen_callbacks set, outside the flush()
    //    function, guarantees this behavior.
    const seen_callbacks = new Set();
    let flushidx = 0; // Do *not* move this inside the flush() function
    function flush() {
        // Do not reenter flush while dirty components are updated, as this can
        // result in an infinite loop. Instead, let the inner flush handle it.
        // Reentrancy is ok afterwards for bindings etc.
        if (flushidx !== 0) {
            return;
        }
        const saved_component = current_component;
        do {
            // first, call beforeUpdate functions
            // and update components
            try {
                while (flushidx < dirty_components.length) {
                    const component = dirty_components[flushidx];
                    flushidx++;
                    set_current_component(component);
                    update(component.$$);
                }
            }
            catch (e) {
                // reset dirty state to not end up in a deadlocked state and then rethrow
                dirty_components.length = 0;
                flushidx = 0;
                throw e;
            }
            set_current_component(null);
            dirty_components.length = 0;
            flushidx = 0;
            while (binding_callbacks.length)
                binding_callbacks.pop()();
            // then, once components are updated, call
            // afterUpdate functions. This may cause
            // subsequent updates...
            for (let i = 0; i < render_callbacks.length; i += 1) {
                const callback = render_callbacks[i];
                if (!seen_callbacks.has(callback)) {
                    // ...so guard against infinite loops
                    seen_callbacks.add(callback);
                    callback();
                }
            }
            render_callbacks.length = 0;
        } while (dirty_components.length);
        while (flush_callbacks.length) {
            flush_callbacks.pop()();
        }
        update_scheduled = false;
        seen_callbacks.clear();
        set_current_component(saved_component);
    }
    function update($$) {
        if ($$.fragment !== null) {
            $$.update();
            run_all($$.before_update);
            const dirty = $$.dirty;
            $$.dirty = [-1];
            $$.fragment && $$.fragment.p($$.ctx, dirty);
            $$.after_update.forEach(add_render_callback);
        }
    }
    /**
     * Useful for example to execute remaining `afterUpdate` callbacks before executing `destroy`.
     */
    function flush_render_callbacks(fns) {
        const filtered = [];
        const targets = [];
        render_callbacks.forEach((c) => fns.indexOf(c) === -1 ? filtered.push(c) : targets.push(c));
        targets.forEach((c) => c());
        render_callbacks = filtered;
    }
    const outroing = new Set();
    let outros;
    function group_outros() {
        outros = {
            r: 0,
            c: [],
            p: outros // parent group
        };
    }
    function check_outros() {
        if (!outros.r) {
            run_all(outros.c);
        }
        outros = outros.p;
    }
    function transition_in(block, local) {
        if (block && block.i) {
            outroing.delete(block);
            block.i(local);
        }
    }
    function transition_out(block, local, detach, callback) {
        if (block && block.o) {
            if (outroing.has(block))
                return;
            outroing.add(block);
            outros.c.push(() => {
                outroing.delete(block);
                if (callback) {
                    if (detach)
                        block.d(1);
                    callback();
                }
            });
            block.o(local);
        }
        else if (callback) {
            callback();
        }
    }

    const globals = (typeof window !== 'undefined'
        ? window
        : typeof globalThis !== 'undefined'
            ? globalThis
            : global);

    function bind(component, name, callback) {
        const index = component.$$.props[name];
        if (index !== undefined) {
            component.$$.bound[index] = callback;
            callback(component.$$.ctx[index]);
        }
    }
    function create_component(block) {
        block && block.c();
    }
    function mount_component(component, target, anchor, customElement) {
        const { fragment, after_update } = component.$$;
        fragment && fragment.m(target, anchor);
        if (!customElement) {
            // onMount happens before the initial afterUpdate
            add_render_callback(() => {
                const new_on_destroy = component.$$.on_mount.map(run).filter(is_function);
                // if the component was destroyed immediately
                // it will update the `$$.on_destroy` reference to `null`.
                // the destructured on_destroy may still reference to the old array
                if (component.$$.on_destroy) {
                    component.$$.on_destroy.push(...new_on_destroy);
                }
                else {
                    // Edge case - component was destroyed immediately,
                    // most likely as a result of a binding initialising
                    run_all(new_on_destroy);
                }
                component.$$.on_mount = [];
            });
        }
        after_update.forEach(add_render_callback);
    }
    function destroy_component(component, detaching) {
        const $$ = component.$$;
        if ($$.fragment !== null) {
            flush_render_callbacks($$.after_update);
            run_all($$.on_destroy);
            $$.fragment && $$.fragment.d(detaching);
            // TODO null out other refs, including component.$$ (but need to
            // preserve final state?)
            $$.on_destroy = $$.fragment = null;
            $$.ctx = [];
        }
    }
    function make_dirty(component, i) {
        if (component.$$.dirty[0] === -1) {
            dirty_components.push(component);
            schedule_update();
            component.$$.dirty.fill(0);
        }
        component.$$.dirty[(i / 31) | 0] |= (1 << (i % 31));
    }
    function init(component, options, instance, create_fragment, not_equal, props, append_styles, dirty = [-1]) {
        const parent_component = current_component;
        set_current_component(component);
        const $$ = component.$$ = {
            fragment: null,
            ctx: [],
            // state
            props,
            update: noop,
            not_equal,
            bound: blank_object(),
            // lifecycle
            on_mount: [],
            on_destroy: [],
            on_disconnect: [],
            before_update: [],
            after_update: [],
            context: new Map(options.context || (parent_component ? parent_component.$$.context : [])),
            // everything else
            callbacks: blank_object(),
            dirty,
            skip_bound: false,
            root: options.target || parent_component.$$.root
        };
        append_styles && append_styles($$.root);
        let ready = false;
        $$.ctx = instance
            ? instance(component, options.props || {}, (i, ret, ...rest) => {
                const value = rest.length ? rest[0] : ret;
                if ($$.ctx && not_equal($$.ctx[i], $$.ctx[i] = value)) {
                    if (!$$.skip_bound && $$.bound[i])
                        $$.bound[i](value);
                    if (ready)
                        make_dirty(component, i);
                }
                return ret;
            })
            : [];
        $$.update();
        ready = true;
        run_all($$.before_update);
        // `false` as a special case of no DOM component
        $$.fragment = create_fragment ? create_fragment($$.ctx) : false;
        if (options.target) {
            if (options.hydrate) {
                const nodes = children(options.target);
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.l(nodes);
                nodes.forEach(detach);
            }
            else {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.c();
            }
            if (options.intro)
                transition_in(component.$$.fragment);
            mount_component(component, options.target, options.anchor, options.customElement);
            flush();
        }
        set_current_component(parent_component);
    }
    /**
     * Base class for Svelte components. Used when dev=false.
     */
    class SvelteComponent {
        $destroy() {
            destroy_component(this, 1);
            this.$destroy = noop;
        }
        $on(type, callback) {
            if (!is_function(callback)) {
                return noop;
            }
            const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
            callbacks.push(callback);
            return () => {
                const index = callbacks.indexOf(callback);
                if (index !== -1)
                    callbacks.splice(index, 1);
            };
        }
        $set($$props) {
            if (this.$$set && !is_empty($$props)) {
                this.$$.skip_bound = true;
                this.$$set($$props);
                this.$$.skip_bound = false;
            }
        }
    }

    function dispatch_dev(type, detail) {
        document.dispatchEvent(custom_event(type, Object.assign({ version: '3.58.0' }, detail), { bubbles: true }));
    }
    function append_dev(target, node) {
        dispatch_dev('SvelteDOMInsert', { target, node });
        append(target, node);
    }
    function insert_dev(target, node, anchor) {
        dispatch_dev('SvelteDOMInsert', { target, node, anchor });
        insert(target, node, anchor);
    }
    function detach_dev(node) {
        dispatch_dev('SvelteDOMRemove', { node });
        detach(node);
    }
    function listen_dev(node, event, handler, options, has_prevent_default, has_stop_propagation, has_stop_immediate_propagation) {
        const modifiers = options === true ? ['capture'] : options ? Array.from(Object.keys(options)) : [];
        if (has_prevent_default)
            modifiers.push('preventDefault');
        if (has_stop_propagation)
            modifiers.push('stopPropagation');
        if (has_stop_immediate_propagation)
            modifiers.push('stopImmediatePropagation');
        dispatch_dev('SvelteDOMAddEventListener', { node, event, handler, modifiers });
        const dispose = listen(node, event, handler, options);
        return () => {
            dispatch_dev('SvelteDOMRemoveEventListener', { node, event, handler, modifiers });
            dispose();
        };
    }
    function attr_dev(node, attribute, value) {
        attr(node, attribute, value);
        if (value == null)
            dispatch_dev('SvelteDOMRemoveAttribute', { node, attribute });
        else
            dispatch_dev('SvelteDOMSetAttribute', { node, attribute, value });
    }
    function set_data_dev(text, data) {
        data = '' + data;
        if (text.data === data)
            return;
        dispatch_dev('SvelteDOMSetData', { node: text, data });
        text.data = data;
    }
    function validate_each_argument(arg) {
        if (typeof arg !== 'string' && !(arg && typeof arg === 'object' && 'length' in arg)) {
            let msg = '{#each} only iterates over array-like objects.';
            if (typeof Symbol === 'function' && arg && Symbol.iterator in arg) {
                msg += ' You can use a spread to convert this iterable into an array.';
            }
            throw new Error(msg);
        }
    }
    function validate_slots(name, slot, keys) {
        for (const slot_key of Object.keys(slot)) {
            if (!~keys.indexOf(slot_key)) {
                console.warn(`<${name}> received an unexpected slot "${slot_key}".`);
            }
        }
    }
    /**
     * Base class for Svelte components with some minor dev-enhancements. Used when dev=true.
     */
    class SvelteComponentDev extends SvelteComponent {
        constructor(options) {
            if (!options || (!options.target && !options.$$inline)) {
                throw new Error("'target' is a required option");
            }
            super();
        }
        $destroy() {
            super.$destroy();
            this.$destroy = () => {
                console.warn('Component was already destroyed'); // eslint-disable-line no-console
            };
        }
        $capture_state() { }
        $inject_state() { }
    }

    let rates = [
        {
            name: "Month",
            perMonth: 1,
        },
        {
            name: "Week",
            perMonth: 4.35,
        },
        {
            name: "Year",
            perMonth: 1 / 12,
        },
    ];

    /* src\components\RateSelector.svelte generated by Svelte v3.58.0 */
    const file$2 = "src\\components\\RateSelector.svelte";

    function get_each_context$1(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[3] = list[i];
    	return child_ctx;
    }

    // (6:2) {#each rates as rate}
    function create_each_block$1(ctx) {
    	let option;
    	let t_value = /*rate*/ ctx[3].name + "";
    	let t;

    	const block = {
    		c: function create() {
    			option = element("option");
    			t = text(t_value);
    			option.__value = /*rate*/ ctx[3].perMonth;
    			option.value = option.__value;
    			add_location(option, file$2, 6, 4, 152);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, option, anchor);
    			append_dev(option, t);
    		},
    		p: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(option);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block$1.name,
    		type: "each",
    		source: "(6:2) {#each rates as rate}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$2(ctx) {
    	let select;
    	let mounted;
    	let dispose;
    	let each_value = rates;
    	validate_each_argument(each_value);
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block$1(get_each_context$1(ctx, each_value, i));
    	}

    	const block = {
    		c: function create() {
    			select = element("select");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			if (/*value*/ ctx[0] === void 0) add_render_callback(() => /*select_change_handler*/ ctx[2].call(select));
    			add_location(select, file$2, 4, 0, 92);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, select, anchor);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				if (each_blocks[i]) {
    					each_blocks[i].m(select, null);
    				}
    			}

    			select_option(select, /*value*/ ctx[0], true);

    			if (!mounted) {
    				dispose = [
    					listen_dev(select, "change", /*select_change_handler*/ ctx[2]),
    					listen_dev(select, "change", /*change_handler*/ ctx[1], false, false, false, false)
    				];

    				mounted = true;
    			}
    		},
    		p: function update(ctx, [dirty]) {
    			if (dirty & /*rates*/ 0) {
    				each_value = rates;
    				validate_each_argument(each_value);
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context$1(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    					} else {
    						each_blocks[i] = create_each_block$1(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(select, null);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value.length;
    			}

    			if (dirty & /*value, rates*/ 1) {
    				select_option(select, /*value*/ ctx[0]);
    			}
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(select);
    			destroy_each(each_blocks, detaching);
    			mounted = false;
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$2.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$2($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('RateSelector', slots, []);
    	let { value } = $$props;

    	$$self.$$.on_mount.push(function () {
    		if (value === undefined && !('value' in $$props || $$self.$$.bound[$$self.$$.props['value']])) {
    			console.warn("<RateSelector> was created without expected prop 'value'");
    		}
    	});

    	const writable_props = ['value'];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<RateSelector> was created with unknown prop '${key}'`);
    	});

    	function change_handler(event) {
    		bubble.call(this, $$self, event);
    	}

    	function select_change_handler() {
    		value = select_value(this);
    		$$invalidate(0, value);
    	}

    	$$self.$$set = $$props => {
    		if ('value' in $$props) $$invalidate(0, value = $$props.value);
    	};

    	$$self.$capture_state = () => ({ rates, value });

    	$$self.$inject_state = $$props => {
    		if ('value' in $$props) $$invalidate(0, value = $$props.value);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [value, change_handler, select_change_handler];
    }

    class RateSelector extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$2, create_fragment$2, safe_not_equal, { value: 0 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "RateSelector",
    			options,
    			id: create_fragment$2.name
    		});
    	}

    	get value() {
    		throw new Error("<RateSelector>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set value(value) {
    		throw new Error("<RateSelector>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* src\components\BudgetItem.svelte generated by Svelte v3.58.0 */
    const file$1 = "src\\components\\BudgetItem.svelte";

    function create_fragment$1(ctx) {
    	let input0;
    	let t0;
    	let input1;
    	let t1;
    	let span0;
    	let t3;
    	let rateselector;
    	let updating_value;
    	let t4;
    	let span1;
    	let t5;
    	let t6_value = (/*item*/ ctx[0].spending.amount * /*item*/ ctx[0].spending.perMonth).toFixed(2) + "";
    	let t6;
    	let t7;
    	let t8;
    	let label;
    	let t9;
    	let input2;
    	let t10;
    	let button;
    	let current;
    	let mounted;
    	let dispose;

    	function rateselector_value_binding(value) {
    		/*rateselector_value_binding*/ ctx[5](value);
    	}

    	let rateselector_props = {};

    	if (/*item*/ ctx[0].spending.perMonth !== void 0) {
    		rateselector_props.value = /*item*/ ctx[0].spending.perMonth;
    	}

    	rateselector = new RateSelector({
    			props: rateselector_props,
    			$$inline: true
    		});

    	binding_callbacks.push(() => bind(rateselector, 'value', rateselector_value_binding));
    	rateselector.$on("change", /*save*/ ctx[2]);

    	const block = {
    		c: function create() {
    			input0 = element("input");
    			t0 = text("\r\n$");
    			input1 = element("input");
    			t1 = space();
    			span0 = element("span");
    			span0.textContent = "per";
    			t3 = space();
    			create_component(rateselector.$$.fragment);
    			t4 = space();
    			span1 = element("span");
    			t5 = text("($");
    			t6 = text(t6_value);
    			t7 = text(" monthly)");
    			t8 = space();
    			label = element("label");
    			t9 = text("exclude ");
    			input2 = element("input");
    			t10 = space();
    			button = element("button");
    			button.textContent = "delete";
    			add_location(input0, file$1, 16, 0, 360);
    			add_location(input1, file$1, 17, 1, 411);
    			add_location(span0, file$1, 18, 0, 472);
    			add_location(span1, file$1, 20, 0, 561);
    			attr_dev(input2, "type", "checkbox");
    			add_location(input2, file$1, 24, 11, 672);
    			add_location(label, file$1, 23, 0, 653);
    			add_location(button, file$1, 30, 0, 781);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, input0, anchor);
    			set_input_value(input0, /*item*/ ctx[0].name);
    			insert_dev(target, t0, anchor);
    			insert_dev(target, input1, anchor);
    			set_input_value(input1, /*item*/ ctx[0].spending.amount);
    			insert_dev(target, t1, anchor);
    			insert_dev(target, span0, anchor);
    			insert_dev(target, t3, anchor);
    			mount_component(rateselector, target, anchor);
    			insert_dev(target, t4, anchor);
    			insert_dev(target, span1, anchor);
    			append_dev(span1, t5);
    			append_dev(span1, t6);
    			append_dev(span1, t7);
    			insert_dev(target, t8, anchor);
    			insert_dev(target, label, anchor);
    			append_dev(label, t9);
    			append_dev(label, input2);
    			input2.checked = /*item*/ ctx[0].excludeFromTotal;
    			insert_dev(target, t10, anchor);
    			insert_dev(target, button, anchor);
    			current = true;

    			if (!mounted) {
    				dispose = [
    					listen_dev(input0, "input", /*input0_input_handler*/ ctx[3]),
    					listen_dev(input0, "input", /*save*/ ctx[2], false, false, false, false),
    					listen_dev(input1, "input", /*input1_input_handler*/ ctx[4]),
    					listen_dev(input1, "input", /*save*/ ctx[2], false, false, false, false),
    					listen_dev(input2, "change", /*input2_change_handler*/ ctx[6]),
    					listen_dev(input2, "change", /*save*/ ctx[2], false, false, false, false),
    					listen_dev(button, "click", /*deleteMe*/ ctx[1], false, false, false, false)
    				];

    				mounted = true;
    			}
    		},
    		p: function update(ctx, [dirty]) {
    			if (dirty & /*item*/ 1 && input0.value !== /*item*/ ctx[0].name) {
    				set_input_value(input0, /*item*/ ctx[0].name);
    			}

    			if (dirty & /*item*/ 1 && input1.value !== /*item*/ ctx[0].spending.amount) {
    				set_input_value(input1, /*item*/ ctx[0].spending.amount);
    			}

    			const rateselector_changes = {};

    			if (!updating_value && dirty & /*item*/ 1) {
    				updating_value = true;
    				rateselector_changes.value = /*item*/ ctx[0].spending.perMonth;
    				add_flush_callback(() => updating_value = false);
    			}

    			rateselector.$set(rateselector_changes);
    			if ((!current || dirty & /*item*/ 1) && t6_value !== (t6_value = (/*item*/ ctx[0].spending.amount * /*item*/ ctx[0].spending.perMonth).toFixed(2) + "")) set_data_dev(t6, t6_value);

    			if (dirty & /*item*/ 1) {
    				input2.checked = /*item*/ ctx[0].excludeFromTotal;
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(rateselector.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(rateselector.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(input0);
    			if (detaching) detach_dev(t0);
    			if (detaching) detach_dev(input1);
    			if (detaching) detach_dev(t1);
    			if (detaching) detach_dev(span0);
    			if (detaching) detach_dev(t3);
    			destroy_component(rateselector, detaching);
    			if (detaching) detach_dev(t4);
    			if (detaching) detach_dev(span1);
    			if (detaching) detach_dev(t8);
    			if (detaching) detach_dev(label);
    			if (detaching) detach_dev(t10);
    			if (detaching) detach_dev(button);
    			mounted = false;
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$1.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$1($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('BudgetItem', slots, []);
    	let { item } = $$props;
    	let dispatch = createEventDispatcher();

    	function deleteMe() {
    		dispatch("delete-item", { id: item.id });
    	}

    	function save() {
    		dispatch("save-item", { id: item.id });
    	}

    	$$self.$$.on_mount.push(function () {
    		if (item === undefined && !('item' in $$props || $$self.$$.bound[$$self.$$.props['item']])) {
    			console.warn("<BudgetItem> was created without expected prop 'item'");
    		}
    	});

    	const writable_props = ['item'];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<BudgetItem> was created with unknown prop '${key}'`);
    	});

    	function input0_input_handler() {
    		item.name = this.value;
    		$$invalidate(0, item);
    	}

    	function input1_input_handler() {
    		item.spending.amount = this.value;
    		$$invalidate(0, item);
    	}

    	function rateselector_value_binding(value) {
    		if ($$self.$$.not_equal(item.spending.perMonth, value)) {
    			item.spending.perMonth = value;
    			$$invalidate(0, item);
    		}
    	}

    	function input2_change_handler() {
    		item.excludeFromTotal = this.checked;
    		$$invalidate(0, item);
    	}

    	$$self.$$set = $$props => {
    		if ('item' in $$props) $$invalidate(0, item = $$props.item);
    	};

    	$$self.$capture_state = () => ({
    		createEventDispatcher,
    		RateSelector,
    		item,
    		dispatch,
    		deleteMe,
    		save
    	});

    	$$self.$inject_state = $$props => {
    		if ('item' in $$props) $$invalidate(0, item = $$props.item);
    		if ('dispatch' in $$props) dispatch = $$props.dispatch;
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [
    		item,
    		deleteMe,
    		save,
    		input0_input_handler,
    		input1_input_handler,
    		rateselector_value_binding,
    		input2_change_handler
    	];
    }

    class BudgetItem extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$1, create_fragment$1, safe_not_equal, { item: 0 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "BudgetItem",
    			options,
    			id: create_fragment$1.name
    		});
    	}

    	get item() {
    		throw new Error("<BudgetItem>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set item(value) {
    		throw new Error("<BudgetItem>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* src\App.svelte generated by Svelte v3.58.0 */

    const { console: console_1 } = globals;
    const file = "src\\App.svelte";

    function get_each_context(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[20] = list[i];
    	child_ctx[21] = list;
    	child_ctx[22] = i;
    	return child_ctx;
    }

    // (81:4) {#each budgetItems as item}
    function create_each_block(ctx) {
    	let li;
    	let budgetitem;
    	let updating_item;
    	let current;

    	function budgetitem_item_binding(value) {
    		/*budgetitem_item_binding*/ ctx[14](value, /*item*/ ctx[20], /*each_value*/ ctx[21], /*item_index*/ ctx[22]);
    	}

    	function delete_item_handler() {
    		return /*delete_item_handler*/ ctx[15](/*item*/ ctx[20]);
    	}

    	let budgetitem_props = {};

    	if (/*item*/ ctx[20] !== void 0) {
    		budgetitem_props.item = /*item*/ ctx[20];
    	}

    	budgetitem = new BudgetItem({ props: budgetitem_props, $$inline: true });
    	binding_callbacks.push(() => bind(budgetitem, 'item', budgetitem_item_binding));
    	budgetitem.$on("delete-item", delete_item_handler);
    	budgetitem.$on("save-item", /*save*/ ctx[9]);

    	const block = {
    		c: function create() {
    			li = element("li");
    			create_component(budgetitem.$$.fragment);
    			add_location(li, file, 81, 6, 2501);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, li, anchor);
    			mount_component(budgetitem, li, null);
    			current = true;
    		},
    		p: function update(new_ctx, dirty) {
    			ctx = new_ctx;
    			const budgetitem_changes = {};

    			if (!updating_item && dirty & /*budgetItems*/ 1) {
    				updating_item = true;
    				budgetitem_changes.item = /*item*/ ctx[20];
    				add_flush_callback(() => updating_item = false);
    			}

    			budgetitem.$set(budgetitem_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(budgetitem.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(budgetitem.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(li);
    			destroy_component(budgetitem);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block.name,
    		type: "each",
    		source: "(81:4) {#each budgetItems as item}",
    		ctx
    	});

    	return block;
    }

    function create_fragment(ctx) {
    	let main;
    	let form0;
    	let input0;
    	let t0;
    	let input1;
    	let t1;
    	let span0;
    	let t3;
    	let rateselector0;
    	let updating_value;
    	let t4;
    	let button0;
    	let t6;
    	let ol;
    	let t7;
    	let li;
    	let span1;
    	let span2;
    	let t9_value = /*budgetItems*/ ctx[0].filter(func).reduce(func_1, 0) + "";
    	let t9;
    	let t10;
    	let form1;
    	let input2;
    	let t11;
    	let input3;
    	let t12;
    	let span3;
    	let t14;
    	let rateselector1;
    	let updating_value_1;
    	let t15;
    	let button1;
    	let t17;
    	let button2;
    	let t19;
    	let button3;
    	let t21;
    	let input4;
    	let current;
    	let mounted;
    	let dispose;

    	function rateselector0_value_binding(value) {
    		/*rateselector0_value_binding*/ ctx[13](value);
    	}

    	let rateselector0_props = {};

    	if (/*newItemSpendingRate*/ ctx[3] !== void 0) {
    		rateselector0_props.value = /*newItemSpendingRate*/ ctx[3];
    	}

    	rateselector0 = new RateSelector({
    			props: rateselector0_props,
    			$$inline: true
    		});

    	binding_callbacks.push(() => bind(rateselector0, 'value', rateselector0_value_binding));
    	let each_value = /*budgetItems*/ ctx[0];
    	validate_each_argument(each_value);
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block(get_each_context(ctx, each_value, i));
    	}

    	const out = i => transition_out(each_blocks[i], 1, 1, () => {
    		each_blocks[i] = null;
    	});

    	function rateselector1_value_binding(value) {
    		/*rateselector1_value_binding*/ ctx[18](value);
    	}

    	let rateselector1_props = {};

    	if (/*newItemSpendingRate*/ ctx[3] !== void 0) {
    		rateselector1_props.value = /*newItemSpendingRate*/ ctx[3];
    	}

    	rateselector1 = new RateSelector({
    			props: rateselector1_props,
    			$$inline: true
    		});

    	binding_callbacks.push(() => bind(rateselector1, 'value', rateselector1_value_binding));

    	const block = {
    		c: function create() {
    			main = element("main");
    			form0 = element("form");
    			input0 = element("input");
    			t0 = space();
    			input1 = element("input");
    			t1 = space();
    			span0 = element("span");
    			span0.textContent = "per";
    			t3 = space();
    			create_component(rateselector0.$$.fragment);
    			t4 = space();
    			button0 = element("button");
    			button0.textContent = "add";
    			t6 = space();
    			ol = element("ol");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			t7 = space();
    			li = element("li");
    			span1 = element("span");
    			span1.textContent = "Total:";
    			span2 = element("span");
    			t9 = text(t9_value);
    			t10 = space();
    			form1 = element("form");
    			input2 = element("input");
    			t11 = space();
    			input3 = element("input");
    			t12 = space();
    			span3 = element("span");
    			span3.textContent = "per";
    			t14 = space();
    			create_component(rateselector1.$$.fragment);
    			t15 = space();
    			button1 = element("button");
    			button1.textContent = "add";
    			t17 = space();
    			button2 = element("button");
    			button2.textContent = "export";
    			t19 = space();
    			button3 = element("button");
    			button3.textContent = "import";
    			t21 = space();
    			input4 = element("input");
    			add_location(input0, file, 73, 4, 2210);
    			attr_dev(input1, "type", "number");
    			attr_dev(input1, "step", "any");
    			add_location(input1, file, 74, 4, 2268);
    			add_location(span0, file, 75, 4, 2336);
    			attr_dev(button0, "type", "submit");
    			add_location(button0, file, 77, 4, 2411);
    			add_location(form0, file, 72, 2, 2164);
    			add_location(span1, file, 90, 6, 2679);
    			add_location(span2, file, 90, 25, 2698);
    			add_location(li, file, 89, 4, 2668);
    			add_location(ol, file, 79, 2, 2458);
    			add_location(input2, file, 102, 4, 3000);
    			attr_dev(input3, "type", "number");
    			attr_dev(input3, "step", "any");
    			add_location(input3, file, 103, 4, 3058);
    			add_location(span3, file, 104, 4, 3126);
    			attr_dev(button1, "type", "submit");
    			add_location(button1, file, 106, 4, 3201);
    			add_location(form1, file, 101, 2, 2954);
    			add_location(button2, file, 108, 2, 3248);
    			add_location(button3, file, 109, 2, 3296);
    			attr_dev(input4, "type", "file");
    			add_location(input4, file, 110, 2, 3344);
    			attr_dev(main, "class", "svelte-1e01gka");
    			add_location(main, file, 71, 0, 2155);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, main, anchor);
    			append_dev(main, form0);
    			append_dev(form0, input0);
    			set_input_value(input0, /*newItemName*/ ctx[1]);
    			append_dev(form0, t0);
    			append_dev(form0, input1);
    			set_input_value(input1, /*newItemSpending*/ ctx[2]);
    			append_dev(form0, t1);
    			append_dev(form0, span0);
    			append_dev(form0, t3);
    			mount_component(rateselector0, form0, null);
    			append_dev(form0, t4);
    			append_dev(form0, button0);
    			append_dev(main, t6);
    			append_dev(main, ol);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				if (each_blocks[i]) {
    					each_blocks[i].m(ol, null);
    				}
    			}

    			append_dev(ol, t7);
    			append_dev(ol, li);
    			append_dev(li, span1);
    			append_dev(li, span2);
    			append_dev(span2, t9);
    			append_dev(main, t10);
    			append_dev(main, form1);
    			append_dev(form1, input2);
    			set_input_value(input2, /*newItemName*/ ctx[1]);
    			append_dev(form1, t11);
    			append_dev(form1, input3);
    			set_input_value(input3, /*newItemSpending*/ ctx[2]);
    			append_dev(form1, t12);
    			append_dev(form1, span3);
    			append_dev(form1, t14);
    			mount_component(rateselector1, form1, null);
    			append_dev(form1, t15);
    			append_dev(form1, button1);
    			append_dev(main, t17);
    			append_dev(main, button2);
    			append_dev(main, t19);
    			append_dev(main, button3);
    			append_dev(main, t21);
    			append_dev(main, input4);
    			current = true;

    			if (!mounted) {
    				dispose = [
    					listen_dev(input0, "input", /*input0_input_handler*/ ctx[11]),
    					listen_dev(input0, "paste", /*onPaste*/ ctx[10], false, false, false, false),
    					listen_dev(input1, "input", /*input1_input_handler*/ ctx[12]),
    					listen_dev(form0, "submit", prevent_default(/*addItem*/ ctx[7]), false, true, false, false),
    					listen_dev(input2, "input", /*input2_input_handler*/ ctx[16]),
    					listen_dev(input2, "paste", /*onPaste*/ ctx[10], false, false, false, false),
    					listen_dev(input3, "input", /*input3_input_handler*/ ctx[17]),
    					listen_dev(form1, "submit", prevent_default(/*addItem*/ ctx[7]), false, true, false, false),
    					listen_dev(button2, "click", /*exportJson*/ ctx[5], false, false, false, false),
    					listen_dev(button3, "click", /*importJson*/ ctx[6], false, false, false, false),
    					listen_dev(input4, "change", /*input4_change_handler*/ ctx[19])
    				];

    				mounted = true;
    			}
    		},
    		p: function update(ctx, [dirty]) {
    			if (dirty & /*newItemName*/ 2 && input0.value !== /*newItemName*/ ctx[1]) {
    				set_input_value(input0, /*newItemName*/ ctx[1]);
    			}

    			if (dirty & /*newItemSpending*/ 4 && to_number(input1.value) !== /*newItemSpending*/ ctx[2]) {
    				set_input_value(input1, /*newItemSpending*/ ctx[2]);
    			}

    			const rateselector0_changes = {};

    			if (!updating_value && dirty & /*newItemSpendingRate*/ 8) {
    				updating_value = true;
    				rateselector0_changes.value = /*newItemSpendingRate*/ ctx[3];
    				add_flush_callback(() => updating_value = false);
    			}

    			rateselector0.$set(rateselector0_changes);

    			if (dirty & /*budgetItems, deleteItem, save*/ 769) {
    				each_value = /*budgetItems*/ ctx[0];
    				validate_each_argument(each_value);
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    						transition_in(each_blocks[i], 1);
    					} else {
    						each_blocks[i] = create_each_block(child_ctx);
    						each_blocks[i].c();
    						transition_in(each_blocks[i], 1);
    						each_blocks[i].m(ol, t7);
    					}
    				}

    				group_outros();

    				for (i = each_value.length; i < each_blocks.length; i += 1) {
    					out(i);
    				}

    				check_outros();
    			}

    			if ((!current || dirty & /*budgetItems*/ 1) && t9_value !== (t9_value = /*budgetItems*/ ctx[0].filter(func).reduce(func_1, 0) + "")) set_data_dev(t9, t9_value);

    			if (dirty & /*newItemName*/ 2 && input2.value !== /*newItemName*/ ctx[1]) {
    				set_input_value(input2, /*newItemName*/ ctx[1]);
    			}

    			if (dirty & /*newItemSpending*/ 4 && to_number(input3.value) !== /*newItemSpending*/ ctx[2]) {
    				set_input_value(input3, /*newItemSpending*/ ctx[2]);
    			}

    			const rateselector1_changes = {};

    			if (!updating_value_1 && dirty & /*newItemSpendingRate*/ 8) {
    				updating_value_1 = true;
    				rateselector1_changes.value = /*newItemSpendingRate*/ ctx[3];
    				add_flush_callback(() => updating_value_1 = false);
    			}

    			rateselector1.$set(rateselector1_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(rateselector0.$$.fragment, local);

    			for (let i = 0; i < each_value.length; i += 1) {
    				transition_in(each_blocks[i]);
    			}

    			transition_in(rateselector1.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(rateselector0.$$.fragment, local);
    			each_blocks = each_blocks.filter(Boolean);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				transition_out(each_blocks[i]);
    			}

    			transition_out(rateselector1.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(main);
    			destroy_component(rateselector0);
    			destroy_each(each_blocks, detaching);
    			destroy_component(rateselector1);
    			mounted = false;
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    const func = it => !it.excludeFromTotal;
    const func_1 = (result, next) => result + next.spending.perMonth * next.spending.amount;

    function instance($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('App', slots, []);
    	let budgetItems = JSON.parse(localStorage.getItem("budget-itmes") || "[]");
    	let newItemName;
    	let newItemSpending;
    	let newItemSpendingRate;

    	function exportJson() {
    		let contentType = "application/json";
    		let a = document.createElement("a");
    		let blob = new Blob([JSON.stringify(budgetItems)], { type: contentType });
    		a.href = window.URL.createObjectURL(blob);
    		a.download = "backup.budget.json";
    		a.click();
    	}

    	let importData;

    	function importJson() {
    		let single = importData[0];
    		let reader = new FileReader();

    		reader.onloadend = () => {
    			$$invalidate(0, budgetItems = JSON.parse(reader.result.toString()));
    			save();
    		};

    		reader.readAsText(single);
    		console.log(importData);
    	}

    	function addItem() {
    		$$invalidate(0, budgetItems = [
    			...budgetItems,
    			{
    				id: crypto.randomUUID(),
    				name: newItemName,
    				excludeFromTotal: false,
    				spending: {
    					perMonth: newItemSpendingRate,
    					amount: newItemSpending
    				}
    			}
    		]);

    		save();
    	}

    	function deleteItem(id) {
    		$$invalidate(0, budgetItems = budgetItems.filter(it => it.id != id));
    		save();
    	}

    	function save() {
    		localStorage.setItem("budget-itmes", JSON.stringify(budgetItems));
    	}

    	function onPaste(e) {
    		let pastedData = e.clipboardData.getData("text");

    		if (pastedData.includes("\t") && pastedData.includes("\n")) {
    			let newItems = pastedData.split("\n").map(l => {
    				let line = l.split("\t");
    				let name = line[0];
    				let amount = parseFloat(line[1]);
    				let perMonth = parseFloat(line[2]);

    				return {
    					name,
    					id: crypto.randomUUID(),
    					excludeFromTotal: false,
    					spending: { perMonth, amount }
    				};
    			});

    			$$invalidate(0, budgetItems = [...budgetItems, ...newItems]);
    			save();
    		}
    	}

    	const writable_props = [];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console_1.warn(`<App> was created with unknown prop '${key}'`);
    	});

    	function input0_input_handler() {
    		newItemName = this.value;
    		$$invalidate(1, newItemName);
    	}

    	function input1_input_handler() {
    		newItemSpending = to_number(this.value);
    		$$invalidate(2, newItemSpending);
    	}

    	function rateselector0_value_binding(value) {
    		newItemSpendingRate = value;
    		$$invalidate(3, newItemSpendingRate);
    	}

    	function budgetitem_item_binding(value, item, each_value, item_index) {
    		each_value[item_index] = value;
    		$$invalidate(0, budgetItems);
    	}

    	const delete_item_handler = item => deleteItem(item.id);

    	function input2_input_handler() {
    		newItemName = this.value;
    		$$invalidate(1, newItemName);
    	}

    	function input3_input_handler() {
    		newItemSpending = to_number(this.value);
    		$$invalidate(2, newItemSpending);
    	}

    	function rateselector1_value_binding(value) {
    		newItemSpendingRate = value;
    		$$invalidate(3, newItemSpendingRate);
    	}

    	function input4_change_handler() {
    		importData = this.files;
    		$$invalidate(4, importData);
    	}

    	$$self.$capture_state = () => ({
    		BudgetItem,
    		RateSelector,
    		budgetItems,
    		newItemName,
    		newItemSpending,
    		newItemSpendingRate,
    		exportJson,
    		importData,
    		importJson,
    		addItem,
    		deleteItem,
    		save,
    		onPaste
    	});

    	$$self.$inject_state = $$props => {
    		if ('budgetItems' in $$props) $$invalidate(0, budgetItems = $$props.budgetItems);
    		if ('newItemName' in $$props) $$invalidate(1, newItemName = $$props.newItemName);
    		if ('newItemSpending' in $$props) $$invalidate(2, newItemSpending = $$props.newItemSpending);
    		if ('newItemSpendingRate' in $$props) $$invalidate(3, newItemSpendingRate = $$props.newItemSpendingRate);
    		if ('importData' in $$props) $$invalidate(4, importData = $$props.importData);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [
    		budgetItems,
    		newItemName,
    		newItemSpending,
    		newItemSpendingRate,
    		importData,
    		exportJson,
    		importJson,
    		addItem,
    		deleteItem,
    		save,
    		onPaste,
    		input0_input_handler,
    		input1_input_handler,
    		rateselector0_value_binding,
    		budgetitem_item_binding,
    		delete_item_handler,
    		input2_input_handler,
    		input3_input_handler,
    		rateselector1_value_binding,
    		input4_change_handler
    	];
    }

    class App extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance, create_fragment, safe_not_equal, {});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "App",
    			options,
    			id: create_fragment.name
    		});
    	}
    }

    const app = new App({
        target: document.body,
        props: {}
    });

    return app;

})();
//# sourceMappingURL=bundle.js.map