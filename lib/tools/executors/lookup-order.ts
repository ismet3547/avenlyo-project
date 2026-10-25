type DemoOrder = {
  order_id: string;
  status: string;
  tracking_status: string | null;
};

const DEMO_ORDERS: Record<string, DemoOrder> = {
  "ORD-4582": {
    order_id: "ORD-4582",
    status: "Kargoya verildi",
    tracking_status: "Transfer merkezinde",
  },
  "ORD-9041": {
    order_id: "ORD-9041",
    status: "Hazırlanıyor",
    tracking_status: "Paketleme aşamasında",
  },
  "ORD-1207": {
    order_id: "ORD-1207",
    status: "Teslim edildi",
    tracking_status: "Teslim edildi",
  },
};

export function lookupOrder(input: { order_id: string }) {
  const orderId = input.order_id.trim().toUpperCase();
  const order = DEMO_ORDERS[orderId];

  if (!order) {
    return {
      order_id: orderId,
      status: "Bulunamadı",
      tracking_status: null,
    };
  }

  return order;
}

export function listDemoOrderIds() {
  return Object.keys(DEMO_ORDERS);
}
