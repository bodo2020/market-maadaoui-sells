-- HR role workspaces v1
-- Adds role/capability vocabulary used by the standalone HR app without changing existing staff assignments.
insert into public.staff_permissions (code, name_ar, module, description) values
  ('hr.view','عرض الموارد البشرية','hr','الدخول إلى مساحة الموارد البشرية الشخصية'),
  ('hr.team.view','عرض الفريق','hr','عرض مساحة الفريق ضمن النطاق المسموح'),
  ('hr.manage_employees','إدارة الموظفين','hr','إدارة ملفات الموظفين ضمن النطاق المسموح'),
  ('hr.organization.manage','إدارة الهيكل التنظيمي','hr','إدارة الهيكل التنظيمي والارتباطات الوظيفية'),
  ('hr.attendance.view','عرض الحضور','hr','عرض بيانات الحضور المسموح بها'),
  ('hr.attendance.manage','إدارة الحضور','hr','إدارة الحضور والاستثناءات'),
  ('hr.attendance.approve','اعتماد الحضور','hr','اعتماد استثناءات وتصحيحات الحضور'),
  ('hr.shifts.view','عرض الشيفتات','hr','عرض جداول الشيفتات'),
  ('hr.shifts.manage','إدارة الشيفتات','hr','إدارة جداول الشيفتات والتغطية'),
  ('hr.leave.view','عرض الإجازات','hr','عرض الإجازات والطلبات ضمن النطاق'),
  ('hr.leave.manage','إدارة الإجازات','hr','إدارة الإجازات والأرصدة'),
  ('hr.leave.approve','اعتماد الإجازات','hr','اعتماد أو رفض طلبات الإجازات'),
  ('hr.payroll.view','عرض الرواتب','hr','عرض دورات الرواتب المصرح بها'),
  ('hr.payroll.manage','إدارة الرواتب','hr','إعداد ومراجعة دورات الرواتب'),
  ('hr.payroll.approve','اعتماد الرواتب','hr','اعتماد وإقفال دورات الرواتب'),
  ('hr.approvals.view','موافقات HR','hr','الوصول إلى صندوق موافقات الموارد البشرية'),
  ('hr.reports.view','تقارير HR','hr','عرض تقارير الموارد البشرية'),
  ('hr.admin','إدارة إعدادات HR','hr','إدارة سياسات وصلاحيات إعدادات الموارد البشرية')
on conflict (code) do update set name_ar=excluded.name_ar, module=excluded.module, description=excluded.description;

insert into public.staff_roles (code, name_ar, scope, description, is_system, active) values
  ('employee','موظف','branch','مساحة الموظف الشخصية في HR',true,true),
  ('team_lead','قائد فريق','branch','إدارة ومتابعة فريق العمل',true,true),
  ('department_manager','مدير قسم','branch','إدارة القسم وموافقاته ضمن النطاق',true,true),
  ('hr_manager','مدير الموارد البشرية','system','إدارة الموارد البشرية على مستوى الشركة',true,true),
  ('hr_admin','مسؤول نظام HR','system','إدارة HR والصلاحيات والسياسات الحساسة',true,true)
on conflict (code) do update set name_ar=excluded.name_ar, scope=excluded.scope, description=excluded.description, active=true;

with grants(role_code, permission_code) as (
  values
    ('employee','hr.view'),('employee','hr.attendance.view'),('employee','hr.shifts.view'),('employee','hr.leave.view'),
    ('team_lead','hr.view'),('team_lead','hr.team.view'),('team_lead','hr.attendance.view'),('team_lead','hr.shifts.view'),('team_lead','hr.leave.view'),('team_lead','hr.approvals.view'),
    ('department_manager','hr.view'),('department_manager','hr.team.view'),('department_manager','hr.attendance.view'),('department_manager','hr.attendance.approve'),('department_manager','hr.shifts.view'),('department_manager','hr.leave.view'),('department_manager','hr.leave.approve'),('department_manager','hr.approvals.view'),('department_manager','hr.reports.view'),
    ('branch_manager','hr.team.view'),('branch_manager','hr.organization.manage'),('branch_manager','hr.shifts.view'),('branch_manager','hr.shifts.manage'),('branch_manager','hr.leave.view'),('branch_manager','hr.leave.manage'),('branch_manager','hr.leave.approve'),('branch_manager','hr.approvals.view'),('branch_manager','hr.reports.view'),
    ('branch_admin','hr.team.view'),('branch_admin','hr.organization.manage'),('branch_admin','hr.shifts.view'),('branch_admin','hr.shifts.manage'),('branch_admin','hr.leave.view'),('branch_admin','hr.leave.manage'),('branch_admin','hr.leave.approve'),('branch_admin','hr.approvals.view'),('branch_admin','hr.reports.view'),
    ('hr_manager','hr.view'),('hr_manager','hr.team.view'),('hr_manager','hr.manage_employees'),('hr_manager','hr.organization.manage'),('hr_manager','hr.attendance.view'),('hr_manager','hr.attendance.manage'),('hr_manager','hr.attendance.approve'),('hr_manager','hr.shifts.view'),('hr_manager','hr.shifts.manage'),('hr_manager','hr.leave.view'),('hr_manager','hr.leave.manage'),('hr_manager','hr.leave.approve'),('hr_manager','hr.payroll.view'),('hr_manager','hr.payroll.manage'),('hr_manager','hr.approvals.view'),('hr_manager','hr.reports.view'),
    ('hr_admin','hr.view'),('hr_admin','hr.team.view'),('hr_admin','hr.manage_employees'),('hr_admin','hr.organization.manage'),('hr_admin','hr.attendance.view'),('hr_admin','hr.attendance.manage'),('hr_admin','hr.attendance.approve'),('hr_admin','hr.shifts.view'),('hr_admin','hr.shifts.manage'),('hr_admin','hr.leave.view'),('hr_admin','hr.leave.manage'),('hr_admin','hr.leave.approve'),('hr_admin','hr.payroll.view'),('hr_admin','hr.payroll.manage'),('hr_admin','hr.payroll.approve'),('hr_admin','hr.approvals.view'),('hr_admin','hr.reports.view'),('hr_admin','hr.admin'),
    ('super_admin','hr.view'),('super_admin','hr.team.view'),('super_admin','hr.manage_employees'),('super_admin','hr.organization.manage'),('super_admin','hr.attendance.view'),('super_admin','hr.attendance.manage'),('super_admin','hr.attendance.approve'),('super_admin','hr.shifts.view'),('super_admin','hr.shifts.manage'),('super_admin','hr.leave.view'),('super_admin','hr.leave.manage'),('super_admin','hr.leave.approve'),('super_admin','hr.payroll.view'),('super_admin','hr.payroll.manage'),('super_admin','hr.payroll.approve'),('super_admin','hr.approvals.view'),('super_admin','hr.reports.view'),('super_admin','hr.admin')
)
insert into public.staff_role_permissions (role_id, permission_id)
select r.id, p.id
from grants g
join public.staff_roles r on r.code=g.role_code
join public.staff_permissions p on p.code=g.permission_code
on conflict do nothing;
