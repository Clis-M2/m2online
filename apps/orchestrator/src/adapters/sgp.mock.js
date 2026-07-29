import { mockCustomers } from '../mock-data/customers.js';

export class MockSgpAdapter {
  async findCustomerByPhone(phone) {
    return mockCustomers.find((customer) => customer.phone === phone) || null;
  }

  async listOpenInvoices(customerRef) {
    const customer = mockCustomers.find((item) => item.customerRef === customerRef);
    return customer?.invoices.filter((invoice) => invoice.status === 'open') || [];
  }
}
