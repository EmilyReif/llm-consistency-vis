import React, { useEffect, useState } from 'react';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';

/** Matches `article.css` mobile overrides for the article (e.g. scrolly). */
const MOBILE_MEDIA_QUERY = '(max-width: 899px)';

const SESSION_KEY = 'llm-consistency-article-mobile-notice-dismissed';

/**
 * Dismissible notice on narrow viewports only: interactive article is easier on a larger screen.
 */
export function MobileArticleNotice() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const update = () => {
      const isMobile = window.matchMedia(MOBILE_MEDIA_QUERY).matches;
      if (!isMobile) {
        setOpen(false);
        return;
      }
      try {
        if (window.sessionStorage.getItem(SESSION_KEY) === '1') {
          setOpen(false);
          return;
        }
      } catch {
        /* private mode, etc. */
      }
      setOpen(true);
    };

    update();
    const mq = window.matchMedia(MOBILE_MEDIA_QUERY);
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  const dismiss = () => {
    try {
      window.sessionStorage.setItem(SESSION_KEY, '1');
    } catch {
      /* ignore */
    }
    setOpen(false);
  };

  return (
    <Dialog
      className="article-mobile-notice-dialog"
      open={open}
      onClose={dismiss}
      aria-labelledby="article-mobile-notice-title"
      fullWidth
      maxWidth="sm"
    >
      <DialogContent>
        <p className="article-mobile-notice-text" id="article-mobile-notice-title">
          This is an interactive article, and it will be easier to read on a larger screen.
        </p>
      </DialogContent>
      <DialogActions sx={{ padding: '0 1.25rem 1rem' }}>
        <Button variant="contained" onClick={dismiss} color="primary">
          OK
        </Button>
      </DialogActions>
    </Dialog>
  );
}
