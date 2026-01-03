import { type NextRequest, NextResponse } from 'next/server';


export async function POST(req: NextRequest) {
  try {
    const { userId } = await req.json();
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");

    const checkIn =
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ` +
    `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

    const jsonSummary={
        "jsonrpc": "2.0",
        "id": 154,
        "params": {
            "service": "object",
            "method": "execute_kw",
            "args": [
            "odoo_akallpav1",                
            8,                               
            "f2a39d51df80d99dd3902eecc520251972ddae33", 
            "hr.attendance",                 
            "create",                        
            [
                {
                "employee_id": userId,           
                "check_in": checkIn 
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
