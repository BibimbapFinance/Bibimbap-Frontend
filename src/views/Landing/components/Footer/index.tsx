import { Link } from '@material-ui/core';
import { DiscordLink, TwitterLink, TelegramLink, MediumLink, DocsLink } from 'src/constants';
import styles from './footer.module.scss';
import TwitterIcon from '../../images/twitter.svg';
import DiscordIcon from '../../images/icon_discord.svg';
import MediumIcon from '../../images/icon_medium.svg';
import GithubIcon from '../../images/icon_github.svg';
import DocsIcon from '../../images/icon_doc.svg';
import TelegramIcon from '../../images/icon_telegram.svg';
import HeaderLogo from 'src/assets/images/header-logo.png';
import PolygonLogo from './polygon-logo.png';
import XIcon from './x-icon.svg';

interface LinkButtonProps {
  name: string;
  href: string;
  image: any;
}

function LinkButton({ name, href, image }: LinkButtonProps) {
  return (
    <Link className={styles.linkButton} href={href}>
      <img className={styles.linkImage} src={image} alt={name} />
      <p>{name}</p>
    </Link>
  );
}

export interface Props {
  backgroundColor?: string;
}

export default function Footer({ backgroundColor }: Props) {
  return (
    <footer className={styles.footer} style={{ backgroundColor }}>
      {/* <h2 className={styles.title}>Join Our Community</h2> */}
      <h2 className={styles.title}>Coming Soon</h2>
      <div className={styles.buttonList}>
        <LinkButton name="Twitter" href={TwitterLink} image={TwitterIcon} />
        <LinkButton name="Discord" href={DiscordLink} image={DiscordIcon} />
        <LinkButton name="Medium" href={MediumLink} image={MediumIcon} />
        <LinkButton name="Telegram" href={TelegramLink} image={TelegramIcon} />
        <LinkButton name="Docs" href={DocsLink} image={DocsIcon} />
      </div>
      {/* <p className={styles.makeit}>WAGMI with (비빔,비빔)</p>
      <div className={styles.logos}>
        <img src={HeaderLogo} alt="logo" />
        <img src={XIcon} alt="x" style={{ width: 20, height: 20 }} />
        <img src={PolygonLogo} alt="logo" />
      </div>
      {/* <div className="contact-us">
        <Link href="mailto:dev@otterclam.finance">Contact Us</Link>
      </div> */}
    </footer>
  );
}
