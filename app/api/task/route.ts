import { type NextRequest, NextResponse } from 'next/server';


export async function POST(req: NextRequest) {
  try {
    const { userId } = await req.json();
    const employeeId = Number(userId);
    const jsonSummary={
  "jsonrpc": "2.0",
  "method": "call",
  "id": 12,
  "params": {
    "service": "object",
    "method": "execute_kw",
    "args": [
      "odoo_akallpav1",
      8,
      "750735676a526e214338805a0084c4e3c9b62e5b",
      "account.analytic.line",
      "search_read",
      [
        [
          ["employee_id", "=", employeeId]
        ]
      ],
      {
        "fields": ["date", "project_id", "task_id", "name", "unit_amount", "so_line"],
        "limit": 100
      }
    ]
  }
}

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
