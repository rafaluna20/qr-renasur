import { type NextRequest, NextResponse } from 'next/server';

const jsonSummary = {
  "jsonrpc": "2.0",
  "method": "call",
  "id": 151,
  "params": {
    "service": "object",
    "method": "execute_kw",
    "args": [
      "odoo_akallpav1",
      8,
      "f2a39d51df80d99dd3902eecc520251972ddae33",
      "hr.employee",
      "search_read",
      [
        [
          ["active", "=", true]
        ]
      ],
      {
        "fields": [
          "id",
          "name",
          "work_email",
          "identification_id",
          "work_phone"
        ],
        "limit": 100
      }
    ]
  }
}

export async function POST() {
  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_ODOO}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(jsonSummary),
      });


    const data = await response.json();    

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Error in presign route:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
