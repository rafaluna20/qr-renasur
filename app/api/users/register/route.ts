import { type NextRequest, NextResponse } from 'next/server';


export async function POST(req: NextRequest) {
  try {
    const { name, email, phone, dni } = await req.json();

    const jsonSummary={
      "jsonrpc": "2.0",
      "method": "call",
      "id": 152,
      "params": {
        "service": "object",
        "method": "execute_kw",
        "args": [
          "odoo_akallpav1",                // Nombre de la base de datos
          8,                               // ID de usuario (uid)
          "f2a39d51df80d99dd3902eecc520251972ddae33", // Token o password
          "hr.employee",                   // Modelo
          "create",                        // Método
          [
            {
              "name": name,        
              "work_email": email,
              "work_phone": phone,
              "active": true,
              "identification_id":dni

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
