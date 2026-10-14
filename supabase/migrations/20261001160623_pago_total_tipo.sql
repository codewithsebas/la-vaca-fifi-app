-- Pago total: el huésped puede pagar toda la estadía de una vez en lugar del abono (confirma y deja el saldo en cero).
alter type public.payment_kind add value if not exists 'full';
