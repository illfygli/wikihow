import axios from "axios";
import cheerio from "cheerio";
import { createCanvas, Image, Canvas } from "canvas";
import { randomInArray } from "./util";
import { getBlacklist } from "./util/blacklist";

const blacklist = getBlacklist();

type ImgSrc = string;
type AltText = string;
type ImgMeta = [ImgSrc, AltText];

async function getWikihow(): Promise<{ title: string; image: ImgMeta }> {
  let retries = 10;
  let title: string | undefined = undefined;
  let imgs!: ImgMeta[];

  async function requestAndParse() {
    const res = await axios.get("https://www.wikihow.com/Special:Randomizer");

    const $ = cheerio.load(res.data);

    const headerList = $("h1");
    if (headerList.length > 1) {
      console.warn(
        `List of <h1> tags has more than one item! Title format might have changed.`
      );
    }

    title = headerList.first().text();

    imgs = $("img.whcdn")
      .toArray()
      .map((img) => [img.attribs["data-src"], img.attribs["alt"]])
      .filter(([url, alt]) => url && alt); // only images with these attributes!
  }

  await requestAndParse();

  const hasTitleAndImages = () => title && imgs.length > 0;
  const isNotBlacklistedTitle = () => title && !blacklist.test(title);

  /* eslint-disable no-await-in-loop */
  while (!(hasTitleAndImages() && isNotBlacklistedTitle()) && retries > 0) {
    if (!hasTitleAndImages()) {
      console.log(
        `Can't retrieve valid random wikihow page, retrying... (${retries} tries remaining)`
      );
      retries--;
      await requestAndParse();
    }

    if (!isNotBlacklistedTitle()) {
      console.log(
        `Title matches blacklist: '${title}' (${retries} tries remaining)`
      );
      retries--;
      await requestAndParse();
    }
  }
  /* eslint-enable no-await-in-loop */
  if (!title || imgs.length === 0) {
    throw new Error(
      `Unable to retrieve or parse a valid Wikihow page! Last result:\nTitle: "${title}"\nImages: [${imgs
        .map((i) => `"${i[0]}"`)
        .join(", ")}]`
    );
  } else if (title && blacklist.test(title)) {
    throw new Error(
      `Title matches blacklist: '${title}' (and retries expended.)`
    );
  }

  return {
    title,
    image: randomInArray(imgs),
  };
}

async function getImage(url: string): Promise<Canvas> {
  const resp = await axios.get(url, {
    responseType: "arraybuffer",
  });

  const image = new Image();
  const imageLoad = new Promise<void>((res, rej) => {
    image.onload = res;
    image.onerror = rej;
  });
  image.src = resp.data;
  await imageLoad;

  // crop the image. 93% height is a rough estimate for getting rid of the
  // watermark.
  const canvas = createCanvas(image.width, image.height * 0.93);
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(image, 0, 0);

  return canvas;
}
export async function makeStatus() {
  const { title } = await getWikihow();
  const { title: titleOrig, image } = await getWikihow();
  const canvas = await getImage(image[0]);
  return { title, titleOrig, canvas, altText: image[1] };
}
