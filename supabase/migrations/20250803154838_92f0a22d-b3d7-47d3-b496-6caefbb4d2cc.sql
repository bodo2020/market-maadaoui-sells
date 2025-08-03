-- Fix ambiguous column reference in update_inventory_session_stats function
CREATE OR REPLACE FUNCTION update_inventory_session_stats() 
RETURNS TRIGGER AS $$
DECLARE
    v_session_id UUID;
    v_total_products INTEGER;
    v_completed_products INTEGER;
    v_matched_products INTEGER;
    v_discrepancy_products INTEGER;
    v_total_difference_value NUMERIC;
BEGIN
    -- Check if session exists for this date
    SELECT id INTO v_session_id 
    FROM inventory_sessions 
    WHERE inventory_sessions.session_date = COALESCE(NEW.inventory_date, OLD.inventory_date);
    
    -- If no session exists, create one
    IF v_session_id IS NULL THEN
        INSERT INTO inventory_sessions (session_date, total_products, completed_products, matched_products, discrepancy_products, total_difference_value, status)
        VALUES (
            COALESCE(NEW.inventory_date, OLD.inventory_date),
            0, 0, 0, 0, 0, 'active'
        )
        RETURNING id INTO v_session_id;
    END IF;
    
    -- Calculate statistics for this session
    SELECT 
        COUNT(*),
        COUNT(CASE WHEN status != 'pending' THEN 1 END),
        COUNT(CASE WHEN status = 'checked' THEN 1 END),
        COUNT(CASE WHEN status = 'discrepancy' THEN 1 END),
        COALESCE(SUM(CASE WHEN status = 'discrepancy' THEN ABS(difference_value) ELSE 0 END), 0)
    INTO 
        v_total_products,
        v_completed_products,
        v_matched_products,
        v_discrepancy_products,
        v_total_difference_value
    FROM inventory_records 
    WHERE inventory_date = COALESCE(NEW.inventory_date, OLD.inventory_date);
    
    -- Update session statistics
    UPDATE inventory_sessions SET
        total_products = v_total_products,
        completed_products = v_completed_products,
        matched_products = v_matched_products,
        discrepancy_products = v_discrepancy_products,
        total_difference_value = v_total_difference_value,
        updated_at = now()
    WHERE id = v_session_id;
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;