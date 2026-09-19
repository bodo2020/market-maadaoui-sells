insert into public.staff_permissions (code,name_ar,module,description) values
('social.access','الدخول إلى المعداوي Connect','social','الدخول إلى تطبيق خدمة العملاء والسوشيال ميديا'),
('social.inbox.view','عرض صندوق رسائل السوشيال','social','عرض المحادثات الواردة من القنوات المتصلة'),
('social.inbox.reply','الرد على محادثات السوشيال','social','إرسال ردود للعملاء من القنوات المتصلة'),
('social.inbox.assign','توزيع محادثات السوشيال','social','إسناد المحادثات لموظفين أو فرق'),
('social.inbox.close','إغلاق محادثات السوشيال','social','حل وإغلاق وإعادة فتح المحادثات'),
('social.customers.link','ربط حسابات السوشيال بالعملاء','social','ربط هوية العميل على المنصات بسجل CRM'),
('social.media.view','عرض مركز الميديا','social','عرض المحتوى والتقويم والحملات'),
('social.media.create','إنشاء محتوى السوشيال','social','إنشاء مسودات منشورات وحملات'),
('social.media.approve','اعتماد محتوى السوشيال','social','مراجعة واعتماد المحتوى قبل النشر'),
('social.media.publish','نشر محتوى السوشيال','social','تنفيذ نشر المحتوى المعتمد على القنوات'),
('social.comments.manage','إدارة التعليقات والمنشن','social','متابعة والرد على التعليقات والمنشن حسب القناة'),
('social.analytics.view','عرض تحليلات السوشيال','social','عرض أداء القنوات والمحتوى والتحويلات'),
('social.accounts.manage','إدارة حسابات وقنوات السوشيال','social','إدارة إعدادات ربط حسابات التواصل'),
('social.ai.use','استخدام AI لخدمة العملاء والميديا','social','استخدام اقتراحات الذكاء الاصطناعي في الردود والمحتوى'),
('social.supervisor','إشراف خدمة العملاء والسوشيال','social','إدارة التصعيدات والتوزيع ومراقبة الأداء')
on conflict (code) do update set name_ar=excluded.name_ar,module=excluded.module,description=excluded.description;
