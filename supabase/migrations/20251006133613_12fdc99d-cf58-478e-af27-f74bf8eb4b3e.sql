-- تحديث السجلات القديمة في cash_tracking لربطها بالفرع الرئيسي
UPDATE cash_tracking
SET branch_id = '7b1b9f30-fe0f-44a9-9179-2a2cc49dc92a'
WHERE branch_id IS NULL AND register_type = 'store';

-- تحديث السجلات القديمة في cash_transactions لربطها بالفرع الرئيسي
UPDATE cash_transactions
SET branch_id = '7b1b9f30-fe0f-44a9-9179-2a2cc49dc92a'
WHERE branch_id IS NULL AND register_type = 'store';

-- تحديث السجلات القديمة في sales لربطها بالفرع الرئيسي (إن وُجدت)
UPDATE sales
SET branch_id = '7b1b9f30-fe0f-44a9-9179-2a2cc49dc92a'
WHERE branch_id IS NULL;