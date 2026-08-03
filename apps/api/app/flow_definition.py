"""Native WhatsApp Flow JSON for in-chat booking (no browser)."""

from __future__ import annotations

BOOKING_FLOW_NAME = "baseapp_booking_v1"

# Flow JSON v6.0 with endpoint-driven screens.
# Package → Date (only open dates) → Time (only open slots) → Confirm
BOOKING_FLOW_JSON: dict = {
    "version": "6.0",
    "data_api_version": "3.0",
    "routing_model": {
        "PACKAGE": ["DATE"],
        "DATE": ["TIME"],
        "TIME": ["CONFIRM"],
        "CONFIRM": [],
    },
    "screens": [
        {
            "id": "PACKAGE",
            "title": "Choose package",
            "data": {
                "packages": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "id": {"type": "string"},
                            "title": {"type": "string"},
                            "description": {"type": "string"},
                        },
                    },
                    "__example__": [
                        {"id": "1", "title": "Massage 60m", "description": "MYR 120 · 60 min"}
                    ],
                }
            },
            "layout": {
                "type": "SingleColumnLayout",
                "children": [
                    {
                        "type": "TextHeading",
                        "text": "Book an appointment",
                    },
                    {
                        "type": "TextBody",
                        "text": "Select a package. Only available dates and times will be offered next.",
                    },
                    {
                        "type": "RadioButtonsGroup",
                        "name": "package_id",
                        "label": "Package",
                        "required": True,
                        "data-source": "${data.packages}",
                    },
                    {
                        "type": "Footer",
                        "label": "Continue",
                        "on-click-action": {
                            "name": "data_exchange",
                            "payload": {
                                "package_id": "${form.package_id}",
                            },
                        },
                    },
                ],
            },
        },
        {
            "id": "DATE",
            "title": "Choose date",
            "data": {
                "package_id": {"type": "string", "__example__": "1"},
                "package_name": {"type": "string", "__example__": "Massage 60m"},
                "dates": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "id": {"type": "string"},
                            "title": {"type": "string"},
                            "description": {"type": "string"},
                        },
                    },
                    "__example__": [
                        {"id": "2026-08-04", "title": "Tomorrow", "description": "04 Aug 2026"}
                    ],
                },
            },
            "layout": {
                "type": "SingleColumnLayout",
                "children": [
                    {
                        "type": "TextHeading",
                        "text": "${data.package_name}",
                    },
                    {
                        "type": "TextBody",
                        "text": "Pick a date that still has open slots.",
                    },
                    {
                        "type": "RadioButtonsGroup",
                        "name": "date_id",
                        "label": "Date",
                        "required": True,
                        "data-source": "${data.dates}",
                    },
                    {
                        "type": "Footer",
                        "label": "Continue",
                        "on-click-action": {
                            "name": "data_exchange",
                            "payload": {
                                "package_id": "${data.package_id}",
                                "package_name": "${data.package_name}",
                                "date_id": "${form.date_id}",
                            },
                        },
                    },
                ],
            },
        },
        {
            "id": "TIME",
            "title": "Choose time",
            "data": {
                "package_id": {"type": "string", "__example__": "1"},
                "package_name": {"type": "string", "__example__": "Massage 60m"},
                "date_id": {"type": "string", "__example__": "2026-08-04"},
                "date_label": {"type": "string", "__example__": "Tomorrow"},
                "slots": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "id": {"type": "string"},
                            "title": {"type": "string"},
                        },
                    },
                    "__example__": [{"id": "2026-08-04T15:00:00+08:00", "title": "3:00 PM"}],
                },
            },
            "layout": {
                "type": "SingleColumnLayout",
                "children": [
                    {
                        "type": "TextHeading",
                        "text": "${data.date_label}",
                    },
                    {
                        "type": "TextBody",
                        "text": "Only open times are listed. Sold-out slots are hidden.",
                    },
                    {
                        "type": "RadioButtonsGroup",
                        "name": "slot_id",
                        "label": "Time",
                        "required": True,
                        "data-source": "${data.slots}",
                    },
                    {
                        "type": "Footer",
                        "label": "Continue",
                        "on-click-action": {
                            "name": "data_exchange",
                            "payload": {
                                "package_id": "${data.package_id}",
                                "package_name": "${data.package_name}",
                                "date_id": "${data.date_id}",
                                "date_label": "${data.date_label}",
                                "slot_id": "${form.slot_id}",
                            },
                        },
                    },
                ],
            },
        },
        {
            "id": "CONFIRM",
            "title": "Confirm",
            "terminal": True,
            "data": {
                "package_id": {"type": "string", "__example__": "1"},
                "package_name": {"type": "string", "__example__": "Massage 60m"},
                "date_id": {"type": "string", "__example__": "2026-08-04"},
                "date_label": {"type": "string", "__example__": "Tomorrow"},
                "slot_id": {"type": "string", "__example__": "2026-08-04T15:00:00+08:00"},
                "slot_label": {"type": "string", "__example__": "3:00 PM"},
                "price_label": {"type": "string", "__example__": "Deposit MYR 30"},
                "summary": {
                    "type": "string",
                    "__example__": "Massage 60m · Tomorrow · 3:00 PM",
                },
            },
            "layout": {
                "type": "SingleColumnLayout",
                "children": [
                    {
                        "type": "TextHeading",
                        "text": "Confirm booking",
                    },
                    {
                        "type": "TextBody",
                        "text": "${data.summary}",
                    },
                    {
                        "type": "TextCaption",
                        "text": "${data.price_label}",
                    },
                    {
                        "type": "Footer",
                        "label": "Confirm & pay",
                        "on-click-action": {
                            "name": "complete",
                            "payload": {
                                "package_id": "${data.package_id}",
                                "package_name": "${data.package_name}",
                                "date_id": "${data.date_id}",
                                "slot_id": "${data.slot_id}",
                                "slot_label": "${data.slot_label}",
                            },
                        },
                    },
                ],
            },
        },
    ],
}
