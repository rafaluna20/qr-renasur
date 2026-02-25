// Learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom'

// Mock environment variables for testing
process.env.ODOO_URL = 'https://test-odoo.com/jsonrpc'
process.env.ODOO_DATABASE = 'test_db'
process.env.ODOO_USER_ID = '1'
process.env.ODOO_API_KEY = 'test_key'
process.env.NEXT_PUBLIC_URL = 'http://localhost:3000'
process.env.NEXT_PUBLIC_PROYECTO_ID = '1'
process.env.NEXT_PUBLIC_TAREA_ID = '1'
