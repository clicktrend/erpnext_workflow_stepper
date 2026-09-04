"""Custom fields that hold the Workflow Stepper configuration on the Workflow document.

Created on install and re-asserted on every migrate (idempotent); removed on uninstall.
"""

import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields

CUSTOM_FIELDS = {
	"Workflow": [
		{
			"fieldname": "workflow_stepper_section",
			"label": "Workflow Stepper",
			"fieldtype": "Section Break",
			"insert_after": "workflow_data",
		},
		{
			"fieldname": "show_workflow_stepper",
			"label": "Show Workflow Stepper on Form",
			"fieldtype": "Check",
			"default": "1",
			"insert_after": "workflow_stepper_section",
			"description": "Show the states of this workflow as a step bar above the form tabs.",
		},
		{
			"fieldname": "workflow_stepper_show_actions",
			"label": "Show Actions in Workflow Stepper",
			"fieldtype": "Check",
			"default": "1",
			"insert_after": "show_workflow_stepper",
			"description": "Render the transitions allowed for the current user as buttons next to the bar "
			"(the Actions menu stays as it is).",
		},
	],
	"Workflow Document State": [
		{
			"fieldname": "workflow_stepper_step",
			"label": "Step in Workflow Stepper",
			"fieldtype": "Check",
			"insert_after": "doc_status",
			"in_list_view": 1,
			"columns": 1,
			"description": "Tick the states that form the main path, in row order. States that are not "
			"ticked appear as a branch off the path when the document is in them. Nothing ticked: "
			"every state except cancelled ones is shown.",
		},
	],
}


def after_install():
	create_custom_fields(CUSTOM_FIELDS, ignore_validate=True)


def after_migrate():
	after_install()


def before_uninstall():
	for doctype, fields in CUSTOM_FIELDS.items():
		for field in fields:
			name = frappe.db.get_value(
				"Custom Field", {"dt": doctype, "fieldname": field["fieldname"]}, "name"
			)
			if name:
				frappe.delete_doc("Custom Field", name, ignore_permissions=True)
	frappe.clear_cache()
