-- Search folds accents and apostrophes on both sides.
begin;
do $$
begin
  perform tests.eq(public.search_fold('Caffè'), 'caffe', 'accent folded');
  perform tests.eq(public.search_fold('Caffe’'), 'caffe', 'typographic apostrophe dropped');
  perform tests.eq(public.search_fold('Polarità ÉCRU'), 'polarita ecru', 'upper-case accents folded');
end $$;
rollback;
