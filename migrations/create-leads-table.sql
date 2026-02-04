-- ============================================================================
-- MIGRATION: Create leads table for property contact form submissions
-- Purpose: Store lead submissions from property contact forms
-- ============================================================================

-- 1. Create the leads table
-- ============================================================================
CREATE TABLE IF NOT EXISTS leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

    -- Property reference (optional - can be a general inquiry)
    propiedad_id UUID REFERENCES propiedades(id) ON DELETE SET NULL,
    property_title VARCHAR(500),

    -- Agent assignment
    asignado UUID REFERENCES usuarios(id) ON DELETE SET NULL,

    -- Client information
    cliente_nombre VARCHAR(255) NOT NULL,
    cliente_telefono VARCHAR(50),
    cliente_celular VARCHAR(50),
    cliente_email VARCHAR(255) NOT NULL,
    mensaje TEXT,

    -- Terms acceptance
    acepta_terminos BOOLEAN DEFAULT false,

    -- Origin tracking
    origen VARCHAR(100) DEFAULT 'web_formulario',
    referidor_lead VARCHAR(500),

    -- UTM tracking
    utm_source VARCHAR(255),
    utm_medium VARCHAR(255),
    utm_campaign VARCHAR(255),

    -- Technical information
    ip_origen VARCHAR(45),
    user_agent TEXT,
    language VARCHAR(10) DEFAULT 'es',

    -- Status tracking
    estado VARCHAR(50) DEFAULT 'nuevo',
    fecha_contacto TIMESTAMP WITH TIME ZONE,
    notas TEXT,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Create indexes for fast lookups
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_leads_tenant ON leads(tenant_id);
CREATE INDEX IF NOT EXISTS idx_leads_property ON leads(propiedad_id);
CREATE INDEX IF NOT EXISTS idx_leads_agent ON leads(asignado);
CREATE INDEX IF NOT EXISTS idx_leads_estado ON leads(tenant_id, estado);
CREATE INDEX IF NOT EXISTS idx_leads_created ON leads(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_email ON leads(cliente_email);

-- 3. Create updated_at trigger
-- ============================================================================
CREATE OR REPLACE FUNCTION update_leads_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_leads_updated_at ON leads;

CREATE TRIGGER trg_leads_updated_at
    BEFORE UPDATE ON leads
    FOR EACH ROW
    EXECUTE FUNCTION update_leads_updated_at();

-- ============================================================================
-- VERIFICATION:
-- ============================================================================
-- Check table structure:
--   \d leads
--
-- Insert test lead:
--   INSERT INTO leads (tenant_id, cliente_nombre, cliente_email, mensaje)
--   VALUES ('your-tenant-uuid', 'Test User', 'test@example.com', 'Test message');
--
-- Query leads:
--   SELECT * FROM leads WHERE tenant_id = 'your-tenant-uuid' ORDER BY created_at DESC;
-- ============================================================================
