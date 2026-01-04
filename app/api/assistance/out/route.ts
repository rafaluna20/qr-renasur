import { type NextRequest, NextResponse } from 'next/server';


export async function POST(req: NextRequest) {
  try {
    const { registryId } = await req.json();
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");

    const checkOut =
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ` +
    `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

    const jsonSummary={
  "jsonrpc": "2.0",
  "method": "call",
  "id": 155,
  "params": {
    "service": "object",
    "method": "execute_kw",
    "args": [
      "odoo_akallpav1",
      8,
      "750735676a526e214338805a0084c4e3c9b62e5b",
      "hr.attendance",
      "write",
      [
        [registryId],   
        {
          "check_out": checkOut
        }
      ]
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
