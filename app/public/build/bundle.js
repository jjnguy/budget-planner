
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
    function init_binding_group(group) {
        let _inputs;
        return {
            /* push */ p(...inputs) {
                _inputs = inputs;
                _inputs.forEach(input => group.push(input));
            },
            /* remove */ r() {
                _inputs.forEach(input => group.splice(group.indexOf(input), 1));
            }
        };
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
    function toggle_class(element, name, toggle) {
        element.classList[toggle ? 'add' : 'remove'](name);
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
        {
            name: "Bi-Week",
            perMonth: 2.15,
        },
    ];

    /* src\components\RateSelector.svelte generated by Svelte v3.58.0 */
    const file$4 = "src\\components\\RateSelector.svelte";

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
    			add_location(option, file$4, 6, 4, 152);
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

    function create_fragment$4(ctx) {
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
    			add_location(select, file$4, 4, 0, 92);
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
    		id: create_fragment$4.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$4($$self, $$props, $$invalidate) {
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
    		init(this, options, instance$4, create_fragment$4, safe_not_equal, { value: 0 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "RateSelector",
    			options,
    			id: create_fragment$4.name
    		});
    	}

    	get value() {
    		throw new Error("<RateSelector>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set value(value) {
    		throw new Error("<RateSelector>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* src\components\Income.svelte generated by Svelte v3.58.0 */
    const file$3 = "src\\components\\Income.svelte";

    function create_fragment$3(ctx) {
    	let t0_value = JSON.stringify(/*income*/ ctx[0]) + "";
    	let t0;
    	let t1;
    	let span0;
    	let span1;
    	let t3_value = /*income*/ ctx[0].reduce(func$1, 0) + "";
    	let t3;
    	let t4;
    	let form;
    	let input0;
    	let t5;
    	let input1;
    	let t6;
    	let span2;
    	let t8;
    	let rateselector;
    	let updating_value;
    	let t9;
    	let button;
    	let current;
    	let mounted;
    	let dispose;

    	function rateselector_value_binding(value) {
    		/*rateselector_value_binding*/ ctx[7](value);
    	}

    	let rateselector_props = {};

    	if (/*newIncomegRate*/ ctx[3] !== void 0) {
    		rateselector_props.value = /*newIncomegRate*/ ctx[3];
    	}

    	rateselector = new RateSelector({
    			props: rateselector_props,
    			$$inline: true
    		});

    	binding_callbacks.push(() => bind(rateselector, 'value', rateselector_value_binding));

    	const block = {
    		c: function create() {
    			t0 = text(t0_value);
    			t1 = space();
    			span0 = element("span");
    			span0.textContent = "Total monthly income";
    			span1 = element("span");
    			t3 = text(t3_value);
    			t4 = space();
    			form = element("form");
    			input0 = element("input");
    			t5 = space();
    			input1 = element("input");
    			t6 = space();
    			span2 = element("span");
    			span2.textContent = "per";
    			t8 = space();
    			create_component(rateselector.$$.fragment);
    			t9 = space();
    			button = element("button");
    			button.textContent = "add";
    			add_location(span0, file$3, 32, 0, 734);
    			add_location(span1, file$3, 32, 33, 767);
    			add_location(input0, file$3, 40, 2, 938);
    			attr_dev(input1, "type", "number");
    			attr_dev(input1, "step", "any");
    			add_location(input1, file$3, 41, 2, 978);
    			add_location(span2, file$3, 42, 2, 1045);
    			attr_dev(button, "type", "submit");
    			add_location(button, file$3, 44, 2, 1113);
    			add_location(form, file$3, 39, 0, 893);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, t0, anchor);
    			insert_dev(target, t1, anchor);
    			insert_dev(target, span0, anchor);
    			insert_dev(target, span1, anchor);
    			append_dev(span1, t3);
    			insert_dev(target, t4, anchor);
    			insert_dev(target, form, anchor);
    			append_dev(form, input0);
    			set_input_value(input0, /*newIncomeName*/ ctx[1]);
    			append_dev(form, t5);
    			append_dev(form, input1);
    			set_input_value(input1, /*newIncomeAmount*/ ctx[2]);
    			append_dev(form, t6);
    			append_dev(form, span2);
    			append_dev(form, t8);
    			mount_component(rateselector, form, null);
    			append_dev(form, t9);
    			append_dev(form, button);
    			current = true;

    			if (!mounted) {
    				dispose = [
    					listen_dev(input0, "input", /*input0_input_handler*/ ctx[5]),
    					listen_dev(input1, "input", /*input1_input_handler*/ ctx[6]),
    					listen_dev(form, "submit", prevent_default(/*addItem*/ ctx[4]), false, true, false, false)
    				];

    				mounted = true;
    			}
    		},
    		p: function update(ctx, [dirty]) {
    			if ((!current || dirty & /*income*/ 1) && t0_value !== (t0_value = JSON.stringify(/*income*/ ctx[0]) + "")) set_data_dev(t0, t0_value);
    			if ((!current || dirty & /*income*/ 1) && t3_value !== (t3_value = /*income*/ ctx[0].reduce(func$1, 0) + "")) set_data_dev(t3, t3_value);

    			if (dirty & /*newIncomeName*/ 2 && input0.value !== /*newIncomeName*/ ctx[1]) {
    				set_input_value(input0, /*newIncomeName*/ ctx[1]);
    			}

    			if (dirty & /*newIncomeAmount*/ 4 && to_number(input1.value) !== /*newIncomeAmount*/ ctx[2]) {
    				set_input_value(input1, /*newIncomeAmount*/ ctx[2]);
    			}

    			const rateselector_changes = {};

    			if (!updating_value && dirty & /*newIncomegRate*/ 8) {
    				updating_value = true;
    				rateselector_changes.value = /*newIncomegRate*/ ctx[3];
    				add_flush_callback(() => updating_value = false);
    			}

    			rateselector.$set(rateselector_changes);
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
    			if (detaching) detach_dev(t0);
    			if (detaching) detach_dev(t1);
    			if (detaching) detach_dev(span0);
    			if (detaching) detach_dev(span1);
    			if (detaching) detach_dev(t4);
    			if (detaching) detach_dev(form);
    			destroy_component(rateselector);
    			mounted = false;
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$3.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    const func$1 = (result, next) => result + next.amount.perMonth * next.amount.amount;

    function instance$3($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('Income', slots, []);
    	let { income } = $$props;
    	let dispatcher = createEventDispatcher();

    	function save() {
    		dispatcher("income-saved");
    	}

    	let newIncomeName;
    	let newIncomeAmount;
    	let newIncomegRate;

    	function addItem() {
    		$$invalidate(0, income = [
    			...income,
    			{
    				id: crypto.randomUUID(),
    				name: newIncomeName,
    				amount: {
    					perMonth: newIncomegRate,
    					amount: newIncomeAmount
    				}
    			}
    		]);

    		save();
    	}

    	function deleteItem(id) {
    		$$invalidate(0, income = income.filter(it => it.id != id));
    		save();
    	}

    	$$self.$$.on_mount.push(function () {
    		if (income === undefined && !('income' in $$props || $$self.$$.bound[$$self.$$.props['income']])) {
    			console.warn("<Income> was created without expected prop 'income'");
    		}
    	});

    	const writable_props = ['income'];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<Income> was created with unknown prop '${key}'`);
    	});

    	function input0_input_handler() {
    		newIncomeName = this.value;
    		$$invalidate(1, newIncomeName);
    	}

    	function input1_input_handler() {
    		newIncomeAmount = to_number(this.value);
    		$$invalidate(2, newIncomeAmount);
    	}

    	function rateselector_value_binding(value) {
    		newIncomegRate = value;
    		$$invalidate(3, newIncomegRate);
    	}

    	$$self.$$set = $$props => {
    		if ('income' in $$props) $$invalidate(0, income = $$props.income);
    	};

    	$$self.$capture_state = () => ({
    		createEventDispatcher,
    		RateSelector,
    		income,
    		dispatcher,
    		save,
    		newIncomeName,
    		newIncomeAmount,
    		newIncomegRate,
    		addItem,
    		deleteItem
    	});

    	$$self.$inject_state = $$props => {
    		if ('income' in $$props) $$invalidate(0, income = $$props.income);
    		if ('dispatcher' in $$props) dispatcher = $$props.dispatcher;
    		if ('newIncomeName' in $$props) $$invalidate(1, newIncomeName = $$props.newIncomeName);
    		if ('newIncomeAmount' in $$props) $$invalidate(2, newIncomeAmount = $$props.newIncomeAmount);
    		if ('newIncomegRate' in $$props) $$invalidate(3, newIncomegRate = $$props.newIncomegRate);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [
    		income,
    		newIncomeName,
    		newIncomeAmount,
    		newIncomegRate,
    		addItem,
    		input0_input_handler,
    		input1_input_handler,
    		rateselector_value_binding
    	];
    }

    class Income extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$3, create_fragment$3, safe_not_equal, { income: 0 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Income",
    			options,
    			id: create_fragment$3.name
    		});
    	}

    	get income() {
    		throw new Error("<Income>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set income(value) {
    		throw new Error("<Income>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* src\components\BudgetItem.svelte generated by Svelte v3.58.0 */
    const file$2 = "src\\components\\BudgetItem.svelte";

    // (22:0) {#if mode == "Actual"}
    function create_if_block_1$1(ctx) {
    	let t0;
    	let input;
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
    	let current;
    	let mounted;
    	let dispose;

    	function rateselector_value_binding(value) {
    		/*rateselector_value_binding*/ ctx[6](value);
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
    	rateselector.$on("change", /*save*/ ctx[3]);

    	const block = {
    		c: function create() {
    			t0 = text("$");
    			input = element("input");
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
    			add_location(input, file$2, 22, 3, 609);
    			add_location(span0, file$2, 23, 2, 672);
    			add_location(span1, file$2, 25, 2, 765);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, t0, anchor);
    			insert_dev(target, input, anchor);
    			set_input_value(input, /*item*/ ctx[0].spending.amount);
    			insert_dev(target, t1, anchor);
    			insert_dev(target, span0, anchor);
    			insert_dev(target, t3, anchor);
    			mount_component(rateselector, target, anchor);
    			insert_dev(target, t4, anchor);
    			insert_dev(target, span1, anchor);
    			append_dev(span1, t5);
    			append_dev(span1, t6);
    			append_dev(span1, t7);
    			current = true;

    			if (!mounted) {
    				dispose = [
    					listen_dev(input, "input", /*input_input_handler*/ ctx[5]),
    					listen_dev(input, "input", /*save*/ ctx[3], false, false, false, false)
    				];

    				mounted = true;
    			}
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*item*/ 1 && input.value !== /*item*/ ctx[0].spending.amount) {
    				set_input_value(input, /*item*/ ctx[0].spending.amount);
    			}

    			const rateselector_changes = {};

    			if (!updating_value && dirty & /*item*/ 1) {
    				updating_value = true;
    				rateselector_changes.value = /*item*/ ctx[0].spending.perMonth;
    				add_flush_callback(() => updating_value = false);
    			}

    			rateselector.$set(rateselector_changes);
    			if ((!current || dirty & /*item*/ 1) && t6_value !== (t6_value = (/*item*/ ctx[0].spending.amount * /*item*/ ctx[0].spending.perMonth).toFixed(2) + "")) set_data_dev(t6, t6_value);
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
    			if (detaching) detach_dev(t0);
    			if (detaching) detach_dev(input);
    			if (detaching) detach_dev(t1);
    			if (detaching) detach_dev(span0);
    			if (detaching) detach_dev(t3);
    			destroy_component(rateselector, detaching);
    			if (detaching) detach_dev(t4);
    			if (detaching) detach_dev(span1);
    			mounted = false;
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_1$1.name,
    		type: "if",
    		source: "(22:0) {#if mode == \\\"Actual\\\"}",
    		ctx
    	});

    	return block;
    }

    // (31:0) {#if mode == "Planning"}
    function create_if_block$1(ctx) {
    	let input;
    	let input_max_value;
    	let t0;
    	let span;
    	let t1;
    	let t2_value = /*item*/ ctx[0].futureMonthlyAmount.toFixed(2) + "";
    	let t2;
    	let t3;
    	let mounted;
    	let dispose;

    	const block = {
    		c: function create() {
    			input = element("input");
    			t0 = space();
    			span = element("span");
    			t1 = text("($");
    			t2 = text(t2_value);
    			t3 = text(" monthly)");
    			attr_dev(input, "type", "range");
    			attr_dev(input, "min", "0");
    			attr_dev(input, "max", input_max_value = /*item*/ ctx[0].spending.amount * /*item*/ ctx[0].spending.perMonth * 2);
    			attr_dev(input, "step", "0.01");
    			add_location(input, file$2, 31, 2, 898);
    			add_location(span, file$2, 38, 2, 1066);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, input, anchor);
    			set_input_value(input, /*item*/ ctx[0].futureMonthlyAmount);
    			insert_dev(target, t0, anchor);
    			insert_dev(target, span, anchor);
    			append_dev(span, t1);
    			append_dev(span, t2);
    			append_dev(span, t3);

    			if (!mounted) {
    				dispose = [
    					listen_dev(input, "change", /*input_change_input_handler*/ ctx[7]),
    					listen_dev(input, "input", /*input_change_input_handler*/ ctx[7])
    				];

    				mounted = true;
    			}
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*item*/ 1 && input_max_value !== (input_max_value = /*item*/ ctx[0].spending.amount * /*item*/ ctx[0].spending.perMonth * 2)) {
    				attr_dev(input, "max", input_max_value);
    			}

    			if (dirty & /*item*/ 1) {
    				set_input_value(input, /*item*/ ctx[0].futureMonthlyAmount);
    			}

    			if (dirty & /*item*/ 1 && t2_value !== (t2_value = /*item*/ ctx[0].futureMonthlyAmount.toFixed(2) + "")) set_data_dev(t2, t2_value);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(input);
    			if (detaching) detach_dev(t0);
    			if (detaching) detach_dev(span);
    			mounted = false;
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block$1.name,
    		type: "if",
    		source: "(31:0) {#if mode == \\\"Planning\\\"}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$2(ctx) {
    	let input0;
    	let t0;
    	let t1;
    	let t2;
    	let label;
    	let t3;
    	let input1;
    	let t4;
    	let button;
    	let current;
    	let mounted;
    	let dispose;
    	let if_block0 = /*mode*/ ctx[1] == "Actual" && create_if_block_1$1(ctx);
    	let if_block1 = /*mode*/ ctx[1] == "Planning" && create_if_block$1(ctx);

    	const block = {
    		c: function create() {
    			input0 = element("input");
    			t0 = space();
    			if (if_block0) if_block0.c();
    			t1 = space();
    			if (if_block1) if_block1.c();
    			t2 = space();
    			label = element("label");
    			t3 = text("exclude ");
    			input1 = element("input");
    			t4 = space();
    			button = element("button");
    			button.textContent = "delete";
    			add_location(input0, file$2, 20, 0, 532);
    			attr_dev(input1, "type", "checkbox");
    			add_location(input1, file$2, 41, 11, 1155);
    			add_location(label, file$2, 40, 0, 1136);
    			add_location(button, file$2, 47, 0, 1264);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, input0, anchor);
    			set_input_value(input0, /*item*/ ctx[0].name);
    			insert_dev(target, t0, anchor);
    			if (if_block0) if_block0.m(target, anchor);
    			insert_dev(target, t1, anchor);
    			if (if_block1) if_block1.m(target, anchor);
    			insert_dev(target, t2, anchor);
    			insert_dev(target, label, anchor);
    			append_dev(label, t3);
    			append_dev(label, input1);
    			input1.checked = /*item*/ ctx[0].excludeFromTotal;
    			insert_dev(target, t4, anchor);
    			insert_dev(target, button, anchor);
    			current = true;

    			if (!mounted) {
    				dispose = [
    					listen_dev(input0, "input", /*input0_input_handler*/ ctx[4]),
    					listen_dev(input0, "input", /*save*/ ctx[3], false, false, false, false),
    					listen_dev(input1, "change", /*input1_change_handler*/ ctx[8]),
    					listen_dev(input1, "change", /*save*/ ctx[3], false, false, false, false),
    					listen_dev(button, "click", /*deleteMe*/ ctx[2], false, false, false, false)
    				];

    				mounted = true;
    			}
    		},
    		p: function update(ctx, [dirty]) {
    			if (dirty & /*item*/ 1 && input0.value !== /*item*/ ctx[0].name) {
    				set_input_value(input0, /*item*/ ctx[0].name);
    			}

    			if (/*mode*/ ctx[1] == "Actual") {
    				if (if_block0) {
    					if_block0.p(ctx, dirty);

    					if (dirty & /*mode*/ 2) {
    						transition_in(if_block0, 1);
    					}
    				} else {
    					if_block0 = create_if_block_1$1(ctx);
    					if_block0.c();
    					transition_in(if_block0, 1);
    					if_block0.m(t1.parentNode, t1);
    				}
    			} else if (if_block0) {
    				group_outros();

    				transition_out(if_block0, 1, 1, () => {
    					if_block0 = null;
    				});

    				check_outros();
    			}

    			if (/*mode*/ ctx[1] == "Planning") {
    				if (if_block1) {
    					if_block1.p(ctx, dirty);
    				} else {
    					if_block1 = create_if_block$1(ctx);
    					if_block1.c();
    					if_block1.m(t2.parentNode, t2);
    				}
    			} else if (if_block1) {
    				if_block1.d(1);
    				if_block1 = null;
    			}

    			if (dirty & /*item*/ 1) {
    				input1.checked = /*item*/ ctx[0].excludeFromTotal;
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(if_block0);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(if_block0);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(input0);
    			if (detaching) detach_dev(t0);
    			if (if_block0) if_block0.d(detaching);
    			if (detaching) detach_dev(t1);
    			if (if_block1) if_block1.d(detaching);
    			if (detaching) detach_dev(t2);
    			if (detaching) detach_dev(label);
    			if (detaching) detach_dev(t4);
    			if (detaching) detach_dev(button);
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
    	validate_slots('BudgetItem', slots, []);
    	var _a;
    	let { item } = $$props;
    	let { mode } = $$props;

    	item.futureMonthlyAmount = (_a = item.futureMonthlyAmount) !== null && _a !== void 0
    	? _a
    	: item.spending.amount * item.spending.perMonth;

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

    		if (mode === undefined && !('mode' in $$props || $$self.$$.bound[$$self.$$.props['mode']])) {
    			console.warn("<BudgetItem> was created without expected prop 'mode'");
    		}
    	});

    	const writable_props = ['item', 'mode'];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<BudgetItem> was created with unknown prop '${key}'`);
    	});

    	function input0_input_handler() {
    		item.name = this.value;
    		$$invalidate(0, item);
    	}

    	function input_input_handler() {
    		item.spending.amount = this.value;
    		$$invalidate(0, item);
    	}

    	function rateselector_value_binding(value) {
    		if ($$self.$$.not_equal(item.spending.perMonth, value)) {
    			item.spending.perMonth = value;
    			$$invalidate(0, item);
    		}
    	}

    	function input_change_input_handler() {
    		item.futureMonthlyAmount = to_number(this.value);
    		$$invalidate(0, item);
    	}

    	function input1_change_handler() {
    		item.excludeFromTotal = this.checked;
    		$$invalidate(0, item);
    	}

    	$$self.$$set = $$props => {
    		if ('item' in $$props) $$invalidate(0, item = $$props.item);
    		if ('mode' in $$props) $$invalidate(1, mode = $$props.mode);
    	};

    	$$self.$capture_state = () => ({
    		_a,
    		createEventDispatcher,
    		RateSelector,
    		item,
    		mode,
    		dispatch,
    		deleteMe,
    		save
    	});

    	$$self.$inject_state = $$props => {
    		if ('_a' in $$props) _a = $$props._a;
    		if ('item' in $$props) $$invalidate(0, item = $$props.item);
    		if ('mode' in $$props) $$invalidate(1, mode = $$props.mode);
    		if ('dispatch' in $$props) dispatch = $$props.dispatch;
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [
    		item,
    		mode,
    		deleteMe,
    		save,
    		input0_input_handler,
    		input_input_handler,
    		rateselector_value_binding,
    		input_change_input_handler,
    		input1_change_handler
    	];
    }

    class BudgetItem extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$2, create_fragment$2, safe_not_equal, { item: 0, mode: 1 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "BudgetItem",
    			options,
    			id: create_fragment$2.name
    		});
    	}

    	get item() {
    		throw new Error("<BudgetItem>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set item(value) {
    		throw new Error("<BudgetItem>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get mode() {
    		throw new Error("<BudgetItem>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set mode(value) {
    		throw new Error("<BudgetItem>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* src\components\Spending.svelte generated by Svelte v3.58.0 */
    const file$1 = "src\\components\\Spending.svelte";

    function get_each_context(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[21] = list[i];
    	child_ctx[22] = list;
    	child_ctx[23] = i;
    	return child_ctx;
    }

    // (82:2) {#each budgetItems as item}
    function create_each_block(ctx) {
    	let li;
    	let budgetitem;
    	let updating_item;
    	let current;

    	function budgetitem_item_binding(value) {
    		/*budgetitem_item_binding*/ ctx[15](value, /*item*/ ctx[21], /*each_value*/ ctx[22], /*item_index*/ ctx[23]);
    	}

    	function delete_item_handler() {
    		return /*delete_item_handler*/ ctx[16](/*item*/ ctx[21]);
    	}

    	let budgetitem_props = { mode: /*mode*/ ctx[4] };

    	if (/*item*/ ctx[21] !== void 0) {
    		budgetitem_props.item = /*item*/ ctx[21];
    	}

    	budgetitem = new BudgetItem({ props: budgetitem_props, $$inline: true });
    	binding_callbacks.push(() => bind(budgetitem, 'item', budgetitem_item_binding));
    	budgetitem.$on("delete-item", delete_item_handler);
    	budgetitem.$on("save-item", /*save*/ ctx[5]);

    	const block = {
    		c: function create() {
    			li = element("li");
    			create_component(budgetitem.$$.fragment);
    			add_location(li, file$1, 82, 4, 2291);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, li, anchor);
    			mount_component(budgetitem, li, null);
    			current = true;
    		},
    		p: function update(new_ctx, dirty) {
    			ctx = new_ctx;
    			const budgetitem_changes = {};
    			if (dirty & /*mode*/ 16) budgetitem_changes.mode = /*mode*/ ctx[4];

    			if (!updating_item && dirty & /*budgetItems*/ 1) {
    				updating_item = true;
    				budgetitem_changes.item = /*item*/ ctx[21];
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
    		source: "(82:2) {#each budgetItems as item}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$1(ctx) {
    	let label0;
    	let t0;
    	let input0;
    	let t1;
    	let label1;
    	let t2;
    	let input1;
    	let t3;
    	let form0;
    	let input2;
    	let t4;
    	let input3;
    	let t5;
    	let span0;
    	let t7;
    	let rateselector0;
    	let updating_value;
    	let t8;
    	let button0;
    	let t10;
    	let ol;
    	let t11;
    	let li;
    	let span1;
    	let span2;
    	let t13_value = /*budgetItems*/ ctx[0].filter(func).reduce(func_1, 0) + "";
    	let t13;
    	let t14;
    	let form1;
    	let input4;
    	let t15;
    	let input5;
    	let t16;
    	let span3;
    	let t18;
    	let rateselector1;
    	let updating_value_1;
    	let t19;
    	let button1;
    	let current;
    	let binding_group;
    	let mounted;
    	let dispose;

    	function rateselector0_value_binding(value) {
    		/*rateselector0_value_binding*/ ctx[14](value);
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
    		/*rateselector1_value_binding*/ ctx[19](value);
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
    	binding_group = init_binding_group(/*$$binding_groups*/ ctx[10][0]);

    	const block = {
    		c: function create() {
    			label0 = element("label");
    			t0 = text("Actual ");
    			input0 = element("input");
    			t1 = space();
    			label1 = element("label");
    			t2 = text("Planning ");
    			input1 = element("input");
    			t3 = space();
    			form0 = element("form");
    			input2 = element("input");
    			t4 = space();
    			input3 = element("input");
    			t5 = space();
    			span0 = element("span");
    			span0.textContent = "per";
    			t7 = space();
    			create_component(rateselector0.$$.fragment);
    			t8 = space();
    			button0 = element("button");
    			button0.textContent = "add";
    			t10 = space();
    			ol = element("ol");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			t11 = space();
    			li = element("li");
    			span1 = element("span");
    			span1.textContent = "Total:";
    			span2 = element("span");
    			t13 = text(t13_value);
    			t14 = space();
    			form1 = element("form");
    			input4 = element("input");
    			t15 = space();
    			input5 = element("input");
    			t16 = space();
    			span3 = element("span");
    			span3.textContent = "per";
    			t18 = space();
    			create_component(rateselector1.$$.fragment);
    			t19 = space();
    			button1 = element("button");
    			button1.textContent = "add";
    			attr_dev(input0, "type", "radio");
    			attr_dev(input0, "name", "spending-mode");
    			input0.__value = "Actual";
    			input0.value = input0.__value;
    			add_location(input0, file$1, 58, 10, 1719);
    			add_location(label0, file$1, 57, 0, 1701);
    			attr_dev(input1, "type", "radio");
    			attr_dev(input1, "name", "spending-mode");
    			input1.__value = "Planning";
    			input1.value = input1.__value;
    			add_location(input1, file$1, 66, 12, 1850);
    			add_location(label1, file$1, 65, 0, 1830);
    			add_location(input2, file$1, 74, 2, 2008);
    			attr_dev(input3, "type", "number");
    			attr_dev(input3, "step", "any");
    			add_location(input3, file$1, 75, 2, 2065);
    			add_location(span0, file$1, 76, 2, 2132);
    			attr_dev(button0, "type", "submit");
    			add_location(button0, file$1, 78, 2, 2205);
    			add_location(form0, file$1, 73, 0, 1963);
    			add_location(span1, file$1, 92, 4, 2476);
    			add_location(span2, file$1, 92, 23, 2495);
    			add_location(li, file$1, 91, 2, 2466);
    			add_location(ol, file$1, 80, 0, 2250);
    			add_location(input4, file$1, 104, 2, 2785);
    			attr_dev(input5, "type", "number");
    			attr_dev(input5, "step", "any");
    			add_location(input5, file$1, 105, 2, 2842);
    			add_location(span3, file$1, 106, 2, 2909);
    			attr_dev(button1, "type", "submit");
    			add_location(button1, file$1, 108, 2, 2982);
    			add_location(form1, file$1, 103, 0, 2740);
    			binding_group.p(input0, input1);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, label0, anchor);
    			append_dev(label0, t0);
    			append_dev(label0, input0);
    			input0.checked = input0.__value === /*mode*/ ctx[4];
    			insert_dev(target, t1, anchor);
    			insert_dev(target, label1, anchor);
    			append_dev(label1, t2);
    			append_dev(label1, input1);
    			input1.checked = input1.__value === /*mode*/ ctx[4];
    			insert_dev(target, t3, anchor);
    			insert_dev(target, form0, anchor);
    			append_dev(form0, input2);
    			set_input_value(input2, /*newItemName*/ ctx[1]);
    			append_dev(form0, t4);
    			append_dev(form0, input3);
    			set_input_value(input3, /*newItemSpending*/ ctx[2]);
    			append_dev(form0, t5);
    			append_dev(form0, span0);
    			append_dev(form0, t7);
    			mount_component(rateselector0, form0, null);
    			append_dev(form0, t8);
    			append_dev(form0, button0);
    			insert_dev(target, t10, anchor);
    			insert_dev(target, ol, anchor);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				if (each_blocks[i]) {
    					each_blocks[i].m(ol, null);
    				}
    			}

    			append_dev(ol, t11);
    			append_dev(ol, li);
    			append_dev(li, span1);
    			append_dev(li, span2);
    			append_dev(span2, t13);
    			insert_dev(target, t14, anchor);
    			insert_dev(target, form1, anchor);
    			append_dev(form1, input4);
    			set_input_value(input4, /*newItemName*/ ctx[1]);
    			append_dev(form1, t15);
    			append_dev(form1, input5);
    			set_input_value(input5, /*newItemSpending*/ ctx[2]);
    			append_dev(form1, t16);
    			append_dev(form1, span3);
    			append_dev(form1, t18);
    			mount_component(rateselector1, form1, null);
    			append_dev(form1, t19);
    			append_dev(form1, button1);
    			current = true;

    			if (!mounted) {
    				dispose = [
    					listen_dev(input0, "change", /*input0_change_handler*/ ctx[9]),
    					listen_dev(input1, "change", /*input1_change_handler*/ ctx[11]),
    					listen_dev(input2, "input", /*input2_input_handler*/ ctx[12]),
    					listen_dev(input2, "paste", /*onPaste*/ ctx[8], false, false, false, false),
    					listen_dev(input3, "input", /*input3_input_handler*/ ctx[13]),
    					listen_dev(form0, "submit", prevent_default(/*addItem*/ ctx[6]), false, true, false, false),
    					listen_dev(input4, "input", /*input4_input_handler*/ ctx[17]),
    					listen_dev(input4, "paste", /*onPaste*/ ctx[8], false, false, false, false),
    					listen_dev(input5, "input", /*input5_input_handler*/ ctx[18]),
    					listen_dev(form1, "submit", prevent_default(/*addItem*/ ctx[6]), false, true, false, false)
    				];

    				mounted = true;
    			}
    		},
    		p: function update(ctx, [dirty]) {
    			if (dirty & /*mode*/ 16) {
    				input0.checked = input0.__value === /*mode*/ ctx[4];
    			}

    			if (dirty & /*mode*/ 16) {
    				input1.checked = input1.__value === /*mode*/ ctx[4];
    			}

    			if (dirty & /*newItemName*/ 2 && input2.value !== /*newItemName*/ ctx[1]) {
    				set_input_value(input2, /*newItemName*/ ctx[1]);
    			}

    			if (dirty & /*newItemSpending*/ 4 && to_number(input3.value) !== /*newItemSpending*/ ctx[2]) {
    				set_input_value(input3, /*newItemSpending*/ ctx[2]);
    			}

    			const rateselector0_changes = {};

    			if (!updating_value && dirty & /*newItemSpendingRate*/ 8) {
    				updating_value = true;
    				rateselector0_changes.value = /*newItemSpendingRate*/ ctx[3];
    				add_flush_callback(() => updating_value = false);
    			}

    			rateselector0.$set(rateselector0_changes);

    			if (dirty & /*mode, budgetItems, deleteItem, save*/ 177) {
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
    						each_blocks[i].m(ol, t11);
    					}
    				}

    				group_outros();

    				for (i = each_value.length; i < each_blocks.length; i += 1) {
    					out(i);
    				}

    				check_outros();
    			}

    			if ((!current || dirty & /*budgetItems*/ 1) && t13_value !== (t13_value = /*budgetItems*/ ctx[0].filter(func).reduce(func_1, 0) + "")) set_data_dev(t13, t13_value);

    			if (dirty & /*newItemName*/ 2 && input4.value !== /*newItemName*/ ctx[1]) {
    				set_input_value(input4, /*newItemName*/ ctx[1]);
    			}

    			if (dirty & /*newItemSpending*/ 4 && to_number(input5.value) !== /*newItemSpending*/ ctx[2]) {
    				set_input_value(input5, /*newItemSpending*/ ctx[2]);
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
    			if (detaching) detach_dev(label0);
    			if (detaching) detach_dev(t1);
    			if (detaching) detach_dev(label1);
    			if (detaching) detach_dev(t3);
    			if (detaching) detach_dev(form0);
    			destroy_component(rateselector0);
    			if (detaching) detach_dev(t10);
    			if (detaching) detach_dev(ol);
    			destroy_each(each_blocks, detaching);
    			if (detaching) detach_dev(t14);
    			if (detaching) detach_dev(form1);
    			destroy_component(rateselector1);
    			binding_group.r();
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

    const func = it => !it.excludeFromTotal;
    const func_1 = (result, next) => result + next.spending.perMonth * next.spending.amount;

    function instance$1($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('Spending', slots, []);
    	let { budgetItems } = $$props;
    	let dispatcher = createEventDispatcher();

    	function save() {
    		dispatcher("spending-saved");
    	}

    	let newItemName;
    	let newItemSpending;
    	let newItemSpendingRate;

    	function addItem() {
    		$$invalidate(0, budgetItems = [
    			...budgetItems,
    			{
    				id: crypto.randomUUID(),
    				name: newItemName,
    				excludeFromTotal: false,
    				futureMonthlyAmount: newItemSpendingRate * newItemSpending,
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
    					futureMonthlyAmount: perMonth * amount,
    					spending: { perMonth, amount }
    				};
    			});

    			$$invalidate(0, budgetItems = [...budgetItems, ...newItems]);
    			save();
    		}
    	}

    	let mode = "Planning";

    	$$self.$$.on_mount.push(function () {
    		if (budgetItems === undefined && !('budgetItems' in $$props || $$self.$$.bound[$$self.$$.props['budgetItems']])) {
    			console.warn("<Spending> was created without expected prop 'budgetItems'");
    		}
    	});

    	const writable_props = ['budgetItems'];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<Spending> was created with unknown prop '${key}'`);
    	});

    	const $$binding_groups = [[]];

    	function input0_change_handler() {
    		mode = this.__value;
    		$$invalidate(4, mode);
    	}

    	function input1_change_handler() {
    		mode = this.__value;
    		$$invalidate(4, mode);
    	}

    	function input2_input_handler() {
    		newItemName = this.value;
    		$$invalidate(1, newItemName);
    	}

    	function input3_input_handler() {
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

    	function input4_input_handler() {
    		newItemName = this.value;
    		$$invalidate(1, newItemName);
    	}

    	function input5_input_handler() {
    		newItemSpending = to_number(this.value);
    		$$invalidate(2, newItemSpending);
    	}

    	function rateselector1_value_binding(value) {
    		newItemSpendingRate = value;
    		$$invalidate(3, newItemSpendingRate);
    	}

    	$$self.$$set = $$props => {
    		if ('budgetItems' in $$props) $$invalidate(0, budgetItems = $$props.budgetItems);
    	};

    	$$self.$capture_state = () => ({
    		createEventDispatcher,
    		RateSelector,
    		BudgetItem,
    		budgetItems,
    		dispatcher,
    		save,
    		newItemName,
    		newItemSpending,
    		newItemSpendingRate,
    		addItem,
    		deleteItem,
    		onPaste,
    		mode
    	});

    	$$self.$inject_state = $$props => {
    		if ('budgetItems' in $$props) $$invalidate(0, budgetItems = $$props.budgetItems);
    		if ('dispatcher' in $$props) dispatcher = $$props.dispatcher;
    		if ('newItemName' in $$props) $$invalidate(1, newItemName = $$props.newItemName);
    		if ('newItemSpending' in $$props) $$invalidate(2, newItemSpending = $$props.newItemSpending);
    		if ('newItemSpendingRate' in $$props) $$invalidate(3, newItemSpendingRate = $$props.newItemSpendingRate);
    		if ('mode' in $$props) $$invalidate(4, mode = $$props.mode);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [
    		budgetItems,
    		newItemName,
    		newItemSpending,
    		newItemSpendingRate,
    		mode,
    		save,
    		addItem,
    		deleteItem,
    		onPaste,
    		input0_change_handler,
    		$$binding_groups,
    		input1_change_handler,
    		input2_input_handler,
    		input3_input_handler,
    		rateselector0_value_binding,
    		budgetitem_item_binding,
    		delete_item_handler,
    		input4_input_handler,
    		input5_input_handler,
    		rateselector1_value_binding
    	];
    }

    class Spending extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$1, create_fragment$1, safe_not_equal, { budgetItems: 0 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Spending",
    			options,
    			id: create_fragment$1.name
    		});
    	}

    	get budgetItems() {
    		throw new Error("<Spending>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set budgetItems(value) {
    		throw new Error("<Spending>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* src\App.svelte generated by Svelte v3.58.0 */

    const { console: console_1 } = globals;
    const file = "src\\App.svelte";

    // (85:39) 
    function create_if_block_2(ctx) {
    	let button0;
    	let t1;
    	let button1;
    	let t3;
    	let input;
    	let mounted;
    	let dispose;

    	const block = {
    		c: function create() {
    			button0 = element("button");
    			button0.textContent = "export";
    			t1 = space();
    			button1 = element("button");
    			button1.textContent = "import";
    			t3 = space();
    			input = element("input");
    			add_location(button0, file, 85, 6, 3056);
    			add_location(button1, file, 86, 6, 3108);
    			attr_dev(input, "type", "file");
    			add_location(input, file, 87, 6, 3160);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, button0, anchor);
    			insert_dev(target, t1, anchor);
    			insert_dev(target, button1, anchor);
    			insert_dev(target, t3, anchor);
    			insert_dev(target, input, anchor);

    			if (!mounted) {
    				dispose = [
    					listen_dev(button0, "click", /*exportJson*/ ctx[9], false, false, false, false),
    					listen_dev(button1, "click", /*importJson*/ ctx[10], false, false, false, false),
    					listen_dev(input, "change", /*input_change_handler*/ ctx[19])
    				];

    				mounted = true;
    			}
    		},
    		p: noop,
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(button0);
    			if (detaching) detach_dev(t1);
    			if (detaching) detach_dev(button1);
    			if (detaching) detach_dev(t3);
    			if (detaching) detach_dev(input);
    			mounted = false;
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_2.name,
    		type: "if",
    		source: "(85:39) ",
    		ctx
    	});

    	return block;
    }

    // (83:37) 
    function create_if_block_1(ctx) {
    	let income;
    	let updating_income;
    	let current;

    	function income_income_binding(value) {
    		/*income_income_binding*/ ctx[18](value);
    	}

    	let income_props = {};

    	if (/*budgetData*/ ctx[0].income !== void 0) {
    		income_props.income = /*budgetData*/ ctx[0].income;
    	}

    	income = new Income({ props: income_props, $$inline: true });
    	binding_callbacks.push(() => bind(income, 'income', income_income_binding));
    	income.$on("income-saved", /*save*/ ctx[8]);

    	const block = {
    		c: function create() {
    			create_component(income.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(income, target, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			const income_changes = {};

    			if (!updating_income && dirty & /*budgetData*/ 1) {
    				updating_income = true;
    				income_changes.income = /*budgetData*/ ctx[0].income;
    				add_flush_callback(() => updating_income = false);
    			}

    			income.$set(income_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(income.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(income.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(income, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_1.name,
    		type: "if",
    		source: "(83:37) ",
    		ctx
    	});

    	return block;
    }

    // (78:4) {#if currentTab == "Spending"}
    function create_if_block(ctx) {
    	let spending;
    	let updating_budgetItems;
    	let current;

    	function spending_budgetItems_binding(value) {
    		/*spending_budgetItems_binding*/ ctx[17](value);
    	}

    	let spending_props = {};

    	if (/*budgetData*/ ctx[0].expenses !== void 0) {
    		spending_props.budgetItems = /*budgetData*/ ctx[0].expenses;
    	}

    	spending = new Spending({ props: spending_props, $$inline: true });
    	binding_callbacks.push(() => bind(spending, 'budgetItems', spending_budgetItems_binding));
    	spending.$on("spending-saved", /*save*/ ctx[8]);

    	const block = {
    		c: function create() {
    			create_component(spending.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(spending, target, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			const spending_changes = {};

    			if (!updating_budgetItems && dirty & /*budgetData*/ 1) {
    				updating_budgetItems = true;
    				spending_changes.budgetItems = /*budgetData*/ ctx[0].expenses;
    				add_flush_callback(() => updating_budgetItems = false);
    			}

    			spending.$set(spending_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(spending.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(spending.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(spending, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block.name,
    		type: "if",
    		source: "(78:4) {#if currentTab == \\\"Spending\\\"}",
    		ctx
    	});

    	return block;
    }

    function create_fragment(ctx) {
    	let h1;
    	let t1;
    	let main;
    	let section0;
    	let h20;
    	let t3;
    	let div0;
    	let t4;
    	let t5_value = /*totalSpending*/ ctx[3].toFixed(2) + "";
    	let t5;
    	let t6;
    	let div1;
    	let t7;
    	let t8_value = /*totalIncome*/ ctx[2].toFixed(2) + "";
    	let t8;
    	let t9;
    	let div2;
    	let t10_value = (/*isDeficit*/ ctx[7] ? "Deficit" : "Surlpus") + "";
    	let t10;
    	let t11;
    	let t12_value = Math.abs(/*totalIncome*/ ctx[2] - /*totalSpending*/ ctx[3]).toFixed(2) + "";
    	let t12;
    	let t13;
    	let h21;
    	let t15;
    	let div3;
    	let t16;
    	let t17_value = /*forecastedTotalSpending*/ ctx[1].toFixed(2) + "";
    	let t17;
    	let t18;
    	let div4;
    	let t19;
    	let t20_value = /*totalIncome*/ ctx[2].toFixed(2) + "";
    	let t20;
    	let t21;
    	let div5;
    	let t22_value = (/*forcastDeficit*/ ctx[6] ? "Deficit" : "Surlpus") + "";
    	let t22;
    	let t23;
    	let t24_value = Math.abs(/*totalIncome*/ ctx[2] - /*forecastedTotalSpending*/ ctx[1]).toFixed(2) + "";
    	let t24;
    	let t25;
    	let section1;
    	let ul;
    	let li0;
    	let t27;
    	let li1;
    	let t29;
    	let li2;
    	let t31;
    	let current_block_type_index;
    	let if_block;
    	let current;
    	let mounted;
    	let dispose;
    	const if_block_creators = [create_if_block, create_if_block_1, create_if_block_2];
    	const if_blocks = [];

    	function select_block_type(ctx, dirty) {
    		if (/*currentTab*/ ctx[5] == "Spending") return 0;
    		if (/*currentTab*/ ctx[5] == "Income") return 1;
    		if (/*currentTab*/ ctx[5] == "Advanced") return 2;
    		return -1;
    	}

    	if (~(current_block_type_index = select_block_type(ctx))) {
    		if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    	}

    	const block = {
    		c: function create() {
    			h1 = element("h1");
    			h1.textContent = "Budget Explorer";
    			t1 = space();
    			main = element("main");
    			section0 = element("section");
    			h20 = element("h2");
    			h20.textContent = "Actual Overview";
    			t3 = space();
    			div0 = element("div");
    			t4 = text("Total spending: $");
    			t5 = text(t5_value);
    			t6 = space();
    			div1 = element("div");
    			t7 = text("Total income: $");
    			t8 = text(t8_value);
    			t9 = space();
    			div2 = element("div");
    			t10 = text(t10_value);
    			t11 = text(" $");
    			t12 = text(t12_value);
    			t13 = space();
    			h21 = element("h2");
    			h21.textContent = "Forecasted Overview";
    			t15 = space();
    			div3 = element("div");
    			t16 = text("Total spending: $");
    			t17 = text(t17_value);
    			t18 = space();
    			div4 = element("div");
    			t19 = text("Total income: $");
    			t20 = text(t20_value);
    			t21 = space();
    			div5 = element("div");
    			t22 = text(t22_value);
    			t23 = text(" $");
    			t24 = text(t24_value);
    			t25 = space();
    			section1 = element("section");
    			ul = element("ul");
    			li0 = element("li");
    			li0.textContent = "Spending";
    			t27 = space();
    			li1 = element("li");
    			li1.textContent = "Income";
    			t29 = space();
    			li2 = element("li");
    			li2.textContent = "Advanced";
    			t31 = space();
    			if (if_block) if_block.c();
    			add_location(h1, file, 43, 0, 1805);
    			add_location(h20, file, 46, 4, 1853);
    			add_location(div0, file, 47, 4, 1882);
    			add_location(div1, file, 50, 4, 1953);
    			attr_dev(div2, "class", "svelte-1gh7r1g");
    			toggle_class(div2, "deficit", /*isDeficit*/ ctx[7]);
    			add_location(div2, file, 53, 4, 2020);
    			add_location(h21, file, 58, 4, 2177);
    			add_location(div3, file, 59, 4, 2210);
    			add_location(div4, file, 62, 4, 2291);
    			attr_dev(div5, "class", "svelte-1gh7r1g");
    			toggle_class(div5, "deficit", /*forcastDeficit*/ ctx[6]);
    			add_location(div5, file, 65, 4, 2358);
    			add_location(section0, file, 45, 2, 1839);
    			add_location(li0, file, 73, 6, 2571);
    			add_location(li1, file, 74, 6, 2634);
    			add_location(li2, file, 75, 6, 2693);
    			add_location(ul, file, 72, 4, 2560);
    			add_location(section1, file, 71, 2, 2546);
    			attr_dev(main, "class", "svelte-1gh7r1g");
    			add_location(main, file, 44, 0, 1830);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, h1, anchor);
    			insert_dev(target, t1, anchor);
    			insert_dev(target, main, anchor);
    			append_dev(main, section0);
    			append_dev(section0, h20);
    			append_dev(section0, t3);
    			append_dev(section0, div0);
    			append_dev(div0, t4);
    			append_dev(div0, t5);
    			append_dev(section0, t6);
    			append_dev(section0, div1);
    			append_dev(div1, t7);
    			append_dev(div1, t8);
    			append_dev(section0, t9);
    			append_dev(section0, div2);
    			append_dev(div2, t10);
    			append_dev(div2, t11);
    			append_dev(div2, t12);
    			append_dev(section0, t13);
    			append_dev(section0, h21);
    			append_dev(section0, t15);
    			append_dev(section0, div3);
    			append_dev(div3, t16);
    			append_dev(div3, t17);
    			append_dev(section0, t18);
    			append_dev(section0, div4);
    			append_dev(div4, t19);
    			append_dev(div4, t20);
    			append_dev(section0, t21);
    			append_dev(section0, div5);
    			append_dev(div5, t22);
    			append_dev(div5, t23);
    			append_dev(div5, t24);
    			append_dev(main, t25);
    			append_dev(main, section1);
    			append_dev(section1, ul);
    			append_dev(ul, li0);
    			append_dev(ul, t27);
    			append_dev(ul, li1);
    			append_dev(ul, t29);
    			append_dev(ul, li2);
    			append_dev(section1, t31);

    			if (~current_block_type_index) {
    				if_blocks[current_block_type_index].m(section1, null);
    			}

    			current = true;

    			if (!mounted) {
    				dispose = [
    					listen_dev(li0, "click", /*click_handler*/ ctx[14], false, false, false, false),
    					listen_dev(li1, "click", /*click_handler_1*/ ctx[15], false, false, false, false),
    					listen_dev(li2, "click", /*click_handler_2*/ ctx[16], false, false, false, false)
    				];

    				mounted = true;
    			}
    		},
    		p: function update(ctx, [dirty]) {
    			if ((!current || dirty & /*totalSpending*/ 8) && t5_value !== (t5_value = /*totalSpending*/ ctx[3].toFixed(2) + "")) set_data_dev(t5, t5_value);
    			if ((!current || dirty & /*totalIncome*/ 4) && t8_value !== (t8_value = /*totalIncome*/ ctx[2].toFixed(2) + "")) set_data_dev(t8, t8_value);
    			if ((!current || dirty & /*isDeficit*/ 128) && t10_value !== (t10_value = (/*isDeficit*/ ctx[7] ? "Deficit" : "Surlpus") + "")) set_data_dev(t10, t10_value);
    			if ((!current || dirty & /*totalIncome, totalSpending*/ 12) && t12_value !== (t12_value = Math.abs(/*totalIncome*/ ctx[2] - /*totalSpending*/ ctx[3]).toFixed(2) + "")) set_data_dev(t12, t12_value);

    			if (!current || dirty & /*isDeficit*/ 128) {
    				toggle_class(div2, "deficit", /*isDeficit*/ ctx[7]);
    			}

    			if ((!current || dirty & /*forecastedTotalSpending*/ 2) && t17_value !== (t17_value = /*forecastedTotalSpending*/ ctx[1].toFixed(2) + "")) set_data_dev(t17, t17_value);
    			if ((!current || dirty & /*totalIncome*/ 4) && t20_value !== (t20_value = /*totalIncome*/ ctx[2].toFixed(2) + "")) set_data_dev(t20, t20_value);
    			if ((!current || dirty & /*forcastDeficit*/ 64) && t22_value !== (t22_value = (/*forcastDeficit*/ ctx[6] ? "Deficit" : "Surlpus") + "")) set_data_dev(t22, t22_value);
    			if ((!current || dirty & /*totalIncome, forecastedTotalSpending*/ 6) && t24_value !== (t24_value = Math.abs(/*totalIncome*/ ctx[2] - /*forecastedTotalSpending*/ ctx[1]).toFixed(2) + "")) set_data_dev(t24, t24_value);

    			if (!current || dirty & /*forcastDeficit*/ 64) {
    				toggle_class(div5, "deficit", /*forcastDeficit*/ ctx[6]);
    			}

    			let previous_block_index = current_block_type_index;
    			current_block_type_index = select_block_type(ctx);

    			if (current_block_type_index === previous_block_index) {
    				if (~current_block_type_index) {
    					if_blocks[current_block_type_index].p(ctx, dirty);
    				}
    			} else {
    				if (if_block) {
    					group_outros();

    					transition_out(if_blocks[previous_block_index], 1, 1, () => {
    						if_blocks[previous_block_index] = null;
    					});

    					check_outros();
    				}

    				if (~current_block_type_index) {
    					if_block = if_blocks[current_block_type_index];

    					if (!if_block) {
    						if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    						if_block.c();
    					} else {
    						if_block.p(ctx, dirty);
    					}

    					transition_in(if_block, 1);
    					if_block.m(section1, null);
    				} else {
    					if_block = null;
    				}
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(if_block);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(if_block);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(h1);
    			if (detaching) detach_dev(t1);
    			if (detaching) detach_dev(main);

    			if (~current_block_type_index) {
    				if_blocks[current_block_type_index].d();
    			}

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

    function instance($$self, $$props, $$invalidate) {
    	let totalSpending;
    	let totalIncome;
    	let totalDiff;
    	let isDeficit;
    	let forecastedTotalSpending;
    	let foracastDiff;
    	let forcastDeficit;
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('App', slots, []);
    	let budgetData = JSON.parse(localStorage.getItem("__budget_planner:budget-data") || `{ "expenses": [] }`);
    	budgetData.id = budgetData.id || crypto.randomUUID();
    	budgetData.income = budgetData.income || [];

    	function save() {
    		localStorage.setItem("__budget_planner:budget-data", JSON.stringify(budgetData));
    	}

    	function exportJson() {
    		let contentType = "application/json";
    		let a = document.createElement("a");
    		let blob = new Blob([JSON.stringify(budgetData)], { type: contentType });
    		a.href = window.URL.createObjectURL(blob);
    		a.download = "backup.budget.json";
    		a.click();
    	}

    	let importData;

    	function importJson() {
    		let single = importData[0];
    		let reader = new FileReader();

    		reader.onloadend = () => {
    			$$invalidate(0, budgetData = JSON.parse(reader.result.toString()));
    			save();
    		};

    		reader.readAsText(single);
    		console.log(importData);
    	}

    	let currentTab = localStorage.getItem("__budget_planner:tab") || "Spending";

    	function selectTab(tab) {
    		$$invalidate(5, currentTab = tab);
    		localStorage.setItem("__budget_planner:tab", tab);
    	}

    	const writable_props = [];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console_1.warn(`<App> was created with unknown prop '${key}'`);
    	});

    	const click_handler = () => selectTab("Spending");
    	const click_handler_1 = () => selectTab("Income");
    	const click_handler_2 = () => selectTab("Advanced");

    	function spending_budgetItems_binding(value) {
    		if ($$self.$$.not_equal(budgetData.expenses, value)) {
    			budgetData.expenses = value;
    			$$invalidate(0, budgetData);
    		}
    	}

    	function income_income_binding(value) {
    		if ($$self.$$.not_equal(budgetData.income, value)) {
    			budgetData.income = value;
    			$$invalidate(0, budgetData);
    		}
    	}

    	function input_change_handler() {
    		importData = this.files;
    		$$invalidate(4, importData);
    	}

    	$$self.$capture_state = () => ({
    		Income,
    		Spending,
    		budgetData,
    		save,
    		exportJson,
    		importData,
    		importJson,
    		currentTab,
    		selectTab,
    		foracastDiff,
    		forcastDeficit,
    		forecastedTotalSpending,
    		totalIncome,
    		totalDiff,
    		isDeficit,
    		totalSpending
    	});

    	$$self.$inject_state = $$props => {
    		if ('budgetData' in $$props) $$invalidate(0, budgetData = $$props.budgetData);
    		if ('importData' in $$props) $$invalidate(4, importData = $$props.importData);
    		if ('currentTab' in $$props) $$invalidate(5, currentTab = $$props.currentTab);
    		if ('foracastDiff' in $$props) $$invalidate(12, foracastDiff = $$props.foracastDiff);
    		if ('forcastDeficit' in $$props) $$invalidate(6, forcastDeficit = $$props.forcastDeficit);
    		if ('forecastedTotalSpending' in $$props) $$invalidate(1, forecastedTotalSpending = $$props.forecastedTotalSpending);
    		if ('totalIncome' in $$props) $$invalidate(2, totalIncome = $$props.totalIncome);
    		if ('totalDiff' in $$props) $$invalidate(13, totalDiff = $$props.totalDiff);
    		if ('isDeficit' in $$props) $$invalidate(7, isDeficit = $$props.isDeficit);
    		if ('totalSpending' in $$props) $$invalidate(3, totalSpending = $$props.totalSpending);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*budgetData*/ 1) {
    			$$invalidate(3, totalSpending = budgetData.expenses.filter(it => !it.excludeFromTotal).reduce((result, next) => result + next.spending.perMonth * next.spending.amount, 0));
    		}

    		if ($$self.$$.dirty & /*budgetData*/ 1) {
    			$$invalidate(2, totalIncome = budgetData.income.reduce((result, next) => result + next.amount.perMonth * next.amount.amount, 0));
    		}

    		if ($$self.$$.dirty & /*totalIncome, totalSpending*/ 12) {
    			$$invalidate(13, totalDiff = totalIncome - totalSpending);
    		}

    		if ($$self.$$.dirty & /*totalDiff*/ 8192) {
    			$$invalidate(7, isDeficit = totalDiff < 0);
    		}

    		if ($$self.$$.dirty & /*budgetData*/ 1) {
    			$$invalidate(1, forecastedTotalSpending = budgetData.expenses.reduce((result, next) => result + next.futureMonthlyAmount, 0));
    		}

    		if ($$self.$$.dirty & /*totalIncome, forecastedTotalSpending*/ 6) {
    			$$invalidate(12, foracastDiff = totalIncome - forecastedTotalSpending);
    		}

    		if ($$self.$$.dirty & /*foracastDiff*/ 4096) {
    			$$invalidate(6, forcastDeficit = foracastDiff < 0);
    		}
    	};

    	return [
    		budgetData,
    		forecastedTotalSpending,
    		totalIncome,
    		totalSpending,
    		importData,
    		currentTab,
    		forcastDeficit,
    		isDeficit,
    		save,
    		exportJson,
    		importJson,
    		selectTab,
    		foracastDiff,
    		totalDiff,
    		click_handler,
    		click_handler_1,
    		click_handler_2,
    		spending_budgetItems_binding,
    		income_income_binding,
    		input_change_handler
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
