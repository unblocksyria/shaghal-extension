import type { Catalog } from './en';

/**
 * The Arabic catalog. It may leave any key out: a key with no Arabic entry
 * falls back to the English text, never a raw key name (spec 0002, AC-5).
 *
 * Every entry here is a draft awaiting review by a native reader before
 * release (spec 0002, Follow-up).
 */
/**
 * English is the key set, but Arabic has six plural forms where English has
 * two, so `_two`, `_few` and `_many` siblings are allowed alongside any key.
 */
type PluralSuffix = `${string}_${'zero' | 'one' | 'two' | 'few' | 'many' | 'other'}`;

type Arabic<T> = { [K in keyof T]?: T[K] extends string ? string : Arabic<T[K]> } & {
  [pluralKey: PluralSuffix]: string | undefined;
};

export const ar: Arabic<Catalog> = {
  common: {
    tryAgain: 'أعد المحاولة',
    backTo: 'العودة إلى {{name}}',
    back: 'رجوع',
    reportAService: 'أبلغ عن خدمة',
    yourEmail: 'بريدك الإلكتروني',
    emailPlaceholder: 'بريد@مثال.com',
  },

  app: {
    opening: 'جارٍ الفتح…',
    openFailed: 'تعذّر فتح {{name}}: {{message}}',
  },

  header: {
    home: 'الصفحة الرئيسية ل Unblock Syria',
    settings: 'الإعدادات',
  },

  settings: {
    title: 'الإعدادات',
    intro: 'تُحفظ في هذا المتصفح فقط.',
    appearance: 'المظهر',
    themeSystem: 'النظام',
    themeLight: 'فاتح',
    themeDark: 'داكن',
    language: 'اللغة',
    languageSystem: 'النظام',
    languageEnglish: 'الإنجليزية',
    languageArabic: 'العربية',
    emailHelp: 'اختياري. يُملأ في كل نموذج ترسله ليحصل المتطوعون على الفضل. لا يُعرض أبدًا.',
    saveEmail: 'حفظ البريد',
    saved: 'تم الحفظ',
    connectedTo: 'متصل بـ',
    localApi: 'واجهة برمجية تطويرية محلية. تبقى التقارير والأصوات على هذا الجهاز ولا تحتاج إلى تحقق بشري.',
    liveApi: 'خدمة Unblock Syria الفعلية. تذهب التقارير إلى فريق المراجعة.',
  },

  card: {
    status: {
      available: {
        label: 'متاح',
        meaning: 'الاستخدام الأساسي وكل الأجزاء الأخرى التي نتتبعها تعمل من سوريا.',
      },
      usable: {
        label: 'قابل للاستخدام',
        meaning: 'الاستخدام الأساسي يعمل من سوريا. قد لا تعمل بعض الوظائف الأخرى.',
      },
      blocked: {
        label: 'محجوب',
        meaning: 'الاستخدام الأساسي لا يعمل من سوريا.',
      },
      unknown: {
        label: 'غير معروف',
        meaning: 'لم يختبر أحد الاستخدام الأساسي من سوريا بعد.',
      },
    },
    checked: 'آخر فحص: {{date}}',
    voteCount_zero: '{{n}} صوت',
    voteCount_one: '{{n}} صوت',
    voteCount_two: '{{n}} صوتان',
    voteCount_few: '{{n}} أصوات',
    voteCount_many: '{{n}} صوتًا',
    voteCount_other: '{{n}} صوت',
    votesClosed: '{{votes}}. التصويت مغلق لأن هذه الخدمة متاحة.',
    voteIdle: 'أحتاجها',
    voteVoted: 'تم التصويت',
    voteRemove: 'إلغاء الصوت',
    voteRemoving: 'جارٍ الإلغاء…',
    voteVoting: 'جارٍ التصويت…',
    voteRemoveHint: 'انقر لإلغاء صوتك',
    voteConfirm: 'انقر مرة أخرى لإلغاء صوتك.',
    votePriority: 'تُمنح الخدمات ذات الأصوات الكثيرة أولوية التواصل معها.',
    reportWhatWorks: 'أبلغ عمّا يعمل',
    suggestCorrection: 'اقترح تصحيحًا',
    viewOnSite: 'اعرض على Unblock Syria',
    subdomain: 'هذه الصفحة تحت نطاق فرعي لموقع {{name}}، لذا قد تختلف.',
    pickTitle: 'أي خدمة هي هذه؟',
    pickHint: 'لهذا الموقع عدة خدمات نتتبعها. اختر التي تستخدمها.',
    noneOfThese: 'لا شيء مما سبق؟ أبلغ عن خدمة',
    emptyTitle: 'افتح موقعًا ويب',
    emptyDetail: 'انتقل إلى أي موقع في هذه النافذة لترى إن كان يعمل من سوريا.',
    loadingTitle: 'جارٍ فحص هذا الموقع…',
    errorTitle: 'تعذّر فحص هذا الموقع',
    untrackedTitle: 'لا يُتتبع {{host}} بعد',
    untrackedDetail: 'إذا كان يحجب سوريا، أخبرنا عنه. نتحقق منه ثم نتتبعه.',
  },

  report: {
    levelWorking: 'يعمل',
    levelFailing: 'يفشل',
    levelUnknown: 'لم يُفحص',
    partCoreUse: 'الاستخدام الأساسي',
    partLandingPage: 'الصفحة الرئيسية',
    rateLimited: 'تقارير كثيرة من هذه الشبكة. أعد المحاولة لاحقًا.',
    sentTitle: 'أُرسل التقرير',
    sentMessage: 'شكرًا لك. يراجع متطوع كل تقرير قبل أن يغيّر السجل.',
    title: 'أبلغ عمّا يعمل',
    intro: '{{name}}: حدد ما نجح وما فشل من سوريا، بدون VPN.',
    newToTesting: 'جديد في الاختبار؟',
    readGuide: 'اقرأ الدليل',
    loading: 'جارٍ تحميل الأجزاء المطلوب فحصها…',
    notRecorded: 'لم يُسجَّل بعد',
    remove: 'إزالة {{name}}',
    notePlaceholder: 'ماذا حدث؟',
    sameAsRecorded: 'مطابق لما هو مسجَّل. أضف ملاحظة أو صورة لتأكيده مرة أخرى.',
    required: 'مطلوب: ملاحظة أو صورة تُظهر ذلك.',
    addDetailError: 'أضف ملاحظة أو صورة لكل جزء حددته.',
    catalogueFailed: 'تعذّر تحميل الأجزاء الأخرى التي يمكنك إضافتها.',
    addPart: 'أضف جزءًا جرّبته',
    choosePart: 'اختر جزءًا',
    send: 'أرسل التقرير',
    sending: 'جارٍ الإرسال…',
    blocker: 'حدد جزءًا واحدًا على الأقل بأنه يعمل أو يفشل.',
    note: 'كل ما تحدده يُراجع قبل أن يغيّر السجل.',
  },

  correction: {
    fieldUrl: 'رابط الموقع',
    fieldUrlPlaceholder: 'مثال.com',
    fieldDescription: 'الوصف',
    fieldDescriptionPlaceholder: 'أدخل الوصف الصحيح…',
    fieldCategory: 'الفئات',
    fieldSupportEmail: 'بريد الدعم',
    fieldSupportEmailPlaceholder: 'دعم@مثال.com',
    fieldSupportUrl: 'رابط الدعم',
    fieldSupportUrlPlaceholder: 'مثال.com/دعم',
    fieldOther: 'معلومات أخرى',
    fieldOtherPlaceholder: 'صف ما يحتاج إلى تصحيح…',
    categoriesFailed: 'تعذّر تحميل الفئات: {{message}}',
    rateLimited: 'تصحيحات كثيرة من هذه الشبكة. أعد المحاولة لاحقًا.',
    sentTitle: 'أُرسل التصحيح',
    sentMessage: 'شكرًا لمساعدتك في تحسين بياناتنا. سنراجع تصحيحك ونحدّث معلومات الخدمة إن تمت الموافقة عليه.',
    title: 'اقترح تصحيحًا',
    intro: 'هل في إدراج {{name}} خطأ؟ أخبرنا بما يجب أن يكون.',
    whatToCorrect: 'ما الذي يحتاج إلى تصحيح؟',
    recordedAs: 'المسجَّل حاليًا:',
    nothingRecorded: 'لا يوجد تسجيل بعد.',
    chooseFirst: 'اختر ما يحتاج إلى تصحيح.',
    chooseCategory: 'اختر فئة واحدة على الأقل.',
    maxCategories: 'يمكن للخدمة أن يكون لها {{max}} فئات كحد أقصى.',
    enterValue: 'أدخل المعلومات الصحيحة لكل حقل حددته.',
    unchanged: 'أحد هذه هو المسجَّل بالفعل.',
    evidenceLabel: 'لقطات شاشة كدليل',
    evidenceHint: 'اختياري. لقطة من المصدر الرسمي تساعدنا على التحقق بشكل أسرع.',
    submit: 'أرسل التصحيح',
    submitting: 'جارٍ الإرسال…',
    note: 'نراجع جميع التصحيحات قبل تطبيقها. عادة خلال 24 ساعة.',
  },

  reportService: {
    rateLimited: 'تقارير كثيرة من هذه الشبكة. أعد المحاولة لاحقًا.',
    sentTitle: 'استلمنا التقرير',
    sentMessage: 'شكرًا لمساعدتك في رسم خريطة الوصول الرقمي لسوريا. سنراجع ما أرسلته ونضيفه إلى قاعدة بياناتنا.',
    done: 'تم',
    title: 'أبلغ عن خدمة',
    intro: 'أخبرنا عن خدمة تحجب سوريا. نتحقق منها ثم نتتبعها. تصفّح من سوريا بدون VPN حتى نتمكن من فحصها.',
    name: 'اسم الخدمة',
    url: 'رابط الموقع',
    description: 'الوصف',
    descriptionPlaceholder: 'ماذا تقدم، وماذا يحدث عند استخدامها من سوريا؟',
    evidenceLabel: 'لقطات شاشة كدليل',
    evidenceHint: 'لقطات الشاشة هي طريقة تحققنا من التقرير. أضف واحدة تُظهر الحجب أو رسالة الخطأ.',
    submit: 'أرسل التقرير',
    submitting: 'جارٍ الإرسال…',
    blocker: 'أدخل اسم الخدمة.',
    note: 'نراجع جميع البلاغات قبل النشر. عادة خلال 24 ساعة.',
  },

  form: {
    wrongTab: 'يُظهر هذا التبويب {{site}} وليس {{expected}}. عد إليه، أو اضغط مرة أخرى لالتقاط هذا التبويب على أي حال.',
    anotherPage: 'صفحة أخرى',
    captureFailed: 'تعذّر أخذ لقطة شاشة: {{error}}',
    editorOpen: 'احفظ أو ألغِ لقطة الشاشة المفتوحة في المحرر أولًا.',
    uploadFailed: 'تعذّر رفع لقطة شاشة: {{message}}',
    editingWindow: 'جارٍ تحرير {{label}} في نافذته الخاصة.',
    finishEditorFirst: 'أنهِ لقطة الشاشة المفتوحة في المحرر أولًا.',
    cropHint: 'انقر على لقطة شاشة لقصّها أو إخفاء بياناتك الشخصية.',
    addScreenshot: 'أضف لقطة شاشة',
    addAnother: 'أضف لقطة شاشة أخرى',
    emailHelp: 'اختياري. لا يُعرض أبدًا. يُنسب إلى ملفك التطوعي.',
  },

  howItWorks: {
    title: 'كيف يعمل',
    intro: 'افحص وحسّن ما يعمل من سوريا، على أي موقع تزوره.',
    checkTitle: 'افحص أي موقع',
    checkBody: 'افتح موقعًا ويب لترى إن كان يعمل من سوريا.',
    voteTitle: 'صوّت',
    voteBody: 'اضغط «أحتاجها» على الخدمات المحجوبة.',
    reportTitle: 'أبلغ عمّا يعمل',
    reportBody: 'اختبره بدون VPN وأخبرنا.',
    addTitle: 'أضف موقعًا مفقودًا',
    addBody: 'لا يُتتبع بعد؟ أرسله إلينا.',
    callout: 'لا حاجة لحساب. يُفحص عنوان التبويب المفتوح فقط، ما دامت هذه اللوحة مفتوحة.',
  },

  vpn: {
    turnOff: 'أطفئ VPN.',
    body: 'يبدو أنك تتصفح من {{country}} وليس من سوريا. يجب أن يُظهر التقرير ما يحدث من سوريا بدون VPN.',
    checking: 'جارٍ الفحص…',
    checkAgain: 'أعد الفحص',
    torNetwork: 'شبكة Tor',
  },

  categoryPicker: {
    search: 'ابحث في الفئات…',
    none: 'لا توجد فئات.',
    select: 'اختر الفئات الصحيحة…',
    selected: 'تم اختيار {{n}}: {{names}}',
  },

  evidence: {
    item: 'الدليل رقم {{n}}',
    alt: 'الدليل رقم {{n}}',
    editTitle: 'قصّ أو أخفِ بياناتك الشخصية',
    editAria: 'حرّر الدليل رقم {{n}}',
    editing: 'جارٍ التحرير…',
    edit: 'تحرير',
    removeTitle: 'إزالة من التقرير',
    removeAria: 'إزالة الدليل رقم {{n}}',
    viewUploaded: 'اعرض لقطة الشاشة المرفوعة',
  },

  api: {
    timeout: 'استغرق Unblock Syria وقتًا طويلًا في الرد. أعد المحاولة.',
    network: 'تعذّر الوصول إلى Unblock Syria. تحقق من اتصالك.',
    unreadable: 'أرسل Unblock Syria إجابة لم تستطع اللوحة قراءتها.',
    uploadNoFile: 'أجاب الرفع دون عنوان للملف.',
  },

  votes: {
    rateLimited: 'أصوات كثيرة من هذه الشبكة. أعد المحاولة لاحقًا.',
  },

  editor: {
    dialog: 'تحرير {{label}}',
    hiddenArea: 'المنطقة المخفية {{n}}',
    cancel: 'إلغاء',
    close: 'إغلاق',
    opening: 'جارٍ فتح لقطة الشاشة…',
    undo: 'تراجع',
    undoTitle: 'تراجع (⌘Z / Ctrl+Z)',
    redo: 'إعادة',
    redoTitle: 'إعادة (⇧⌘Z / Shift+Ctrl+Z)',
    save: 'حفظ',
    saving: 'جارٍ الحفظ…',
    saveFailed: 'تعذّر حفظ التعديلات: {{error}}',
    resetCrop: 'إعادة ضبط القص',
    discardTitle: 'هل تريد تجاهل تعديلاتك؟',
    discardText: 'تبقى لقطة الشاشة كما كانت قبل أن تفتحها.',
    keepEditing: 'متابعة التحرير',
    discard: 'تجاهل',
    deleteBox: 'احذف هذا الصندوق',
    deleteTitle: 'حذف (⌫)',
    hintOutside: 'كل ما هو خارج الإطار يُستبعد.',
    hintSelected: 'اسحب لتحريكه، أو اسحب أحد الزوايا لتغيير حجمه. Delete يحذفه.',
    hintFrame: 'اسحب الجزء المعتم لتحريك الإطار.',
    hintDraw: 'اسحب فوق الأسماء أو البريد أو الأرقام لتغطيتها بالأسود. اسحب الزوايا البيضاء للقص.',
    hintCropped: 'اسحب لتغطية المزيد، أو اسحب الجزء المعتم لتحريك الإطار. Enter يحفظ.',
    hintBlackout: 'اسحب لتغطية المزيد. اضغط Enter أو حفظ عندما تنتهي.',
    gone: 'لم تعد لقطة الشاشة مفتوحة في اللوحة. أغلق هذه النافذة وأعد المحاولة.',
  },

  turnstile: {
    dialogLabel: 'أكّد أنك إنسان',
    confirm: 'أكّد أنك إنسان للمتابعة.',
    frameTitle: 'تحقق أنك إنسان',
    cancel: 'إلغاء',
    loadFailed: 'تعذّر تحميل التحقق. تحقق من اتصالك وأعد المحاولة.',
    failed: 'فشل التحقق (خطأ {{code}}). أعد المحاولة.',
    timedOut: 'انتهت مهلة التحقق. أعد المحاولة.',
    cancelled: 'أُلغي التحقق.',
  },
};
