require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const Stripe = require('stripe');

const app = express();
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

app.use(cors());
app.use(express.json());

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// 1. Obtener catálogo de productos
app.get('/api/productos', async (req, res) => {
    const { data, error } = await supabase.from('productos').select('*');
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});

// 2. Crear Checkout Session con Stripe (Modo Sandbox)
app.post('/api/crear-checkout-session', async (req, res) => {
    const { items } = req.body; // Arreglo de productos [{ nombre, precio, cantidad }]

    try {
        const lineItems = items.map(item => ({
            price_data: {
                currency: 'mxn',
                product_data: { name: item.nombre },
                unit_amount: Math.round(item.precio * 100), // Stripe maneja centavos
            },
            quantity: item.cantidad || 1,
        }));

        const session = await stripe.checkout.sessions.create({
            line_items: lineItems,
            mode: 'payment',
            success_url: 'http://localhost:3000/api/pago-exitoso?session_id={CHECKOUT_SESSION_ID}',
            cancel_url: 'http://localhost:3000/api/pago-cancelado',
        });

        res.json({ id: session.id, url: session.url });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 3. Confirmación de pago exitoso (Registrar orden y descontar stock)
app.get('/api/pago-exitoso', async (req, res) => {
    const { session_id } = req.query;
    const session = await stripe.checkout.sessions.retrieve(session_id);

    if (session.payment_status === 'paid') {
        // Registrar en Supabase
        await supabase.from('ordenes').insert([{
            cliente_email: session.customer_details.email,
            total: session.amount_total / 100,
            estado: 'completado'
        }]);

        res.send('<h1>¡Pago procesado con éxito en modo Sandbox! 🥖</h1><p>La orden ha sido guardada en Supabase.</p>');
    } else {
        res.status(400).send('El pago no fue aprobado.');
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Backend de la panadería listo en http://localhost:${PORT}`));