// Workflow Stepper — shows the active Frappe workflow of a document as a step bar above the
// form tabs: passed steps, the current step, side states as a branch off the main path, and
// the transitions allowed right now as buttons (same code path as the "Actions" menu).
//
// Everything is read from what Frappe already ships to the browser with the doctype meta:
//   frappe.workflow.workflows[doctype]        active Workflow doc (states + transitions)
//   locals["Workflow State"][name].style      colour of the state pill
//   frappe.workflow.get_transitions(doc)      allowed actions for this user and document
//   frm.states.handle_workflow_action(t)      applies a transition like the Actions menu
//
// Configuration lives on the Workflow document (custom fields created by this app):
//   show_workflow_stepper            master switch (default on)
//   workflow_stepper_show_actions    render allowed transitions as buttons (default on)
//   states[].workflow_stepper_step   tick the states that form the main path, in row order;
//                                nothing ticked = all states except cancelled ones

frappe.provide("erpnext_workflow_stepper");

erpnext_workflow_stepper.STYLE_TO_COLOUR = {
	Success: "green",
	Warning: "orange",
	Danger: "red",
	Primary: "blue",
	Inverse: "gray",
	Info: "blue",
};

erpnext_workflow_stepper.get_workflow = function (doctype) {
	if (!frappe.workflow.get_state_fieldname(doctype)) return null;
	return frappe.workflow.workflows[doctype] || null;
};

// Main path: the ticked states in row order, or every non-cancelled state as a fallback.
erpnext_workflow_stepper.get_path = function (wf) {
	const ticked = (wf.states || []).filter((s) => cint(s.workflow_stepper_step)).map((s) => s.state);
	if (ticked.length) return ticked;
	return (wf.states || []).filter((s) => cint(s.doc_status) !== 2).map((s) => s.state);
};

erpnext_workflow_stepper.colour_of = function (state) {
	const ws = locals["Workflow State"] && locals["Workflow State"][state];
	return (ws && erpnext_workflow_stepper.STYLE_TO_COLOUR[ws.style]) || "gray";
};

// Where does a side state hang off the main path? Prefer the earliest path state that
// transitions INTO it, otherwise the earliest path state it transitions BACK to.
// undefined = no relation to the path (e.g. a cancelled state written by automation).
erpnext_workflow_stepper.anchor_index = function (wf, path, state) {
	const first = (list) => list.filter((i) => i >= 0).sort((a, b) => a - b)[0];
	const transitions = wf.transitions || [];
	const into = transitions.filter((t) => t.next_state === state).map((t) => path.indexOf(t.state));
	const back = transitions.filter((t) => t.state === state).map((t) => path.indexOf(t.next_state));
	const i = first(into);
	return i !== undefined ? i : first(back);
};

erpnext_workflow_stepper.has_approval_access = function (frm, transition) {
	return (
		frappe.session.user === "Administrator" ||
		transition.allow_self_approval ||
		frappe.session.user !== frm.doc.owner
	);
};

erpnext_workflow_stepper.render = function (frm) {
	frm.$wrapper.find(".workflow-stepper-wrapper").remove();
	if (frm.is_new()) return;

	const wf = erpnext_workflow_stepper.get_workflow(frm.doctype);
	if (!wf || cint(wf.show_workflow_stepper === undefined ? 1 : wf.show_workflow_stepper) === 0) return;

	const path = erpnext_workflow_stepper.get_path(wf);
	if (!path.length) return;

	const current = frm.doc[wf.workflow_state_field];
	const esc = frappe.utils.escape_html;
	let pos = path.indexOf(current);
	let branch = "";
	if (pos === -1 && current) {
		const a = erpnext_workflow_stepper.anchor_index(wf, path, current);
		pos = a === undefined ? -1 : a;
		branch = `<span class="ws-branch ws-${erpnext_workflow_stepper.colour_of(current)}" title="${esc(__("Current state, off the main path"))}">${esc(__(current))}</span>`;
	}

	const steps = path
		.map((state, i) => {
			let cls = i < pos ? "done" : "";
			if (i === pos) {
				cls = branch
					? `anchor ws-${erpnext_workflow_stepper.colour_of(current)}`
					: `current ws-${erpnext_workflow_stepper.colour_of(state)}`;
			}
			const check = i < pos ? `<span class="ws-check">&#10003;</span>` : "";
			const chip = i === pos && branch ? branch : "";
			return `<span class="ws-step ${cls}">${check}${esc(__(state))}</span>${chip}`;
		})
		.join("");
	const tail = branch && pos === -1 ? branch : "";

	// Mount above the tab list so the bar is visible on every tab. (frm.dashboard sections
	// would end up inside the "Connections" tab in v15/v16.)
	const $bar = $(`
		<div class="workflow-stepper-wrapper">
			<div class="workflow-stepper">
				<div class="ws-steps">${steps}${tail}</div>
				<div class="ws-actions"></div>
			</div>
		</div>`);
	const $tabs = frm.$wrapper.find(".form-tabs-list").first();
	if ($tabs.length) $tabs.before($bar);
	else frm.$wrapper.find(".form-page").first().prepend($bar);

	// Allowed transitions as buttons — same filter and same handler as the Actions menu.
	// Frappe hides the menu while the form is dirty; so do we.
	const show_actions = wf.workflow_stepper_show_actions === undefined ? 1 : cint(wf.workflow_stepper_show_actions);
	if (!show_actions || frm.doc.__unsaved === 1) return;

	frappe.workflow.get_transitions(frm.doc).then((transitions) => {
		const $actions = $bar.find(".ws-actions");
		transitions
			.filter((t) => frappe.user_roles.includes(t.allowed) && erpnext_workflow_stepper.has_approval_access(frm, t))
			.forEach((t) => {
				const colour = erpnext_workflow_stepper.colour_of(t.next_state);
				$(`<button class="btn btn-xs btn-default"><span class="ws-dot ws-${colour}"></span>${esc(__(t.action))}</button>`)
					.appendTo($actions)
					.on("click", () => {
						if (wf.enable_action_confirmation) {
							frappe.confirm(__("Are you sure you want to {0}?", [t.action]), () =>
								frm.states.handle_workflow_action(t)
							);
						} else {
							frm.states.handle_workflow_action(t);
						}
					});
			});
	});
};

frappe.ui.form.on("*", {
	refresh(frm) {
		erpnext_workflow_stepper.render(frm);
	},
});
