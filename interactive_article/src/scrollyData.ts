/** Biography prompt + sample completions (subset of main app cached examples). */

export const SCROLLY_PROMPT =
  'Your task is to write a short biography for a made-up historic figure. Your bio should include their birth and death date their profession and their greatest contribution.';

export const SCROLLY_GENERATIONS = [
  'Eleanor Finchley (1712–1778) was a pioneering botanist who revolutionized plant classification by introducing the Finchley System, which laid the groundwork for modern taxonomy.',
  'Name: Elara Finch; Birth: March 12, 1783; Death: August 9, 1857; Profession: Inventor; Greatest Contribution: Developed the Finch Aerostat, the first practical hot air balloon, revolutionizing aerial exploration.',
  'Name: Elara Solstice (1842-1910). Profession: Inventor and Engineer. Greatest Contribution: Developed the first sustainable solar-powered steam engine, revolutionizing renewable energy technology in the late 19th century.',
  'Name: Elara Moonstone (1792-1863). Profession: Inventor and Naturalist. Greatest Contribution: Developed the first solar-powered clock, revolutionizing timekeeping and promoting renewable energy awareness in the 19th century.',
  'Name: Elara Thorne (1801-1875); Profession: Astronomer; Greatest Contribution: Discovered the Thorne Comet and pioneered techniques in celestial photography.',
  'Name: Elara Voss (1801-1865). Profession: Engineer and inventor. Greatest contribution: Invented the first steam-powered printing press, revolutionizing mass communication.',
  'Name: Elara Solstice (1785-1857) - Profession: Botanist - Contribution: Discovered the Solstice Flower, a plant with unique medicinal properties that revolutionized 19th-century herbal medicine.',
  'Name: Elara Swiftfoot (1750-1822). Profession: Navigator and Cartographer. Contribution: Elara crafted the first detailed map of the uncharted southern seas, greatly aiding maritime exploration.',
  'Eleanor Cartwright (1824-1888) was a pioneering botanist who revolutionized plant taxonomy by developing the Cartwright Classification System, which is still used as a foundational framework in modern botany.',
  'Name: Elara Finchley (1792-1860), Profession: Inventor, Contribution: Developed the Finchley Steam Engine, revolutionizing agricultural machinery and increasing farming productivity during the 19th century.',
  'Eleanor Brightwell (1823-1885) was an innovative British engineer who pioneered the development of the steam-powered sewing machine in 1864, revolutionizing the textile industry and empowering women workers.',
  'Name: Elara Windrider (1623-1688)  \nProfession: Inventor and Aviator  \nContribution: Elara Windrider revolutionized early aviation with her design of the first successful glider, the "Sky Sailor," enabling humans to glide safely over long distances.',
  'Eleanor Voss, born in 1823 and passing in 1891, was a pioneering botanist who revolutionized plant hybridization, leading to the development of resilient crop varieties that transformed agricultural practices worldwide.',
  'Name: Liora Elmsworth (1723-1791). Profession: Botanist. Contribution: Discovered the Elmsworth Herb, revolutionizing 18th-century medicine with its healing properties.',
  'Eleanor Hargrave (1825-1897) was a pioneering botanist who discovered the Hargrave Orchid, a rare plant species in the Amazon Rainforest, advancing botanical science significantly.',
  'Name: Elara Flint (1792-1856). Profession: Inventor. Contribution: Developed the first steam-powered loom in 1830, revolutionizing the textile industry.',
  'Name: Elara Novara (1721-1783). Profession: Inventor and Astronomer. Contribution: Developed the first functional telescope with a rotating lens system, revolutionizing celestial observations.',
  'Name: Elara Swift; Born: March 12, 1783; Died: August 27, 1845; Profession: Inventor; Contribution: Invented the first steam-powered loom, revolutionizing the textile industry.',
  'Name: Elara Voss; Born: March 12, 1823; Died: August 19, 1889; Profession: Inventor and Engineer; Greatest Contribution: Developed the first efficient steam-powered cooling system, revolutionizing industrial processes and food preservation.',
  'Eleanor Hartwood (1783-1856) was a pioneering British botanist who discovered and classified over 200 new plant species, significantly advancing the field of botany and contributing to the understanding of plant biodiversity.',
  'Lydia Marcellus (1783-1859) was a pioneering botanist who revolutionized plant taxonomy, notably classifying hundreds of previously undocumented plant species across the Americas.',
  'Name: Elara Windrider (1750-1822). Profession: Inventor and Engineer. Greatest Contribution: Developed the first self-sustaining windmill design, revolutionizing renewable energy in 18th-century Europe.',
];

/** Word count of the first line of the first sample completion (for token-by-token reveal). */
const _firstOutFirstLine = SCROLLY_GENERATIONS[0].split('\n')[0].trim();
export const SCROLLY_FIRST_OUTPUT_FIRST_LINE_WORDS = _firstOutFirstLine
  .split(/\s+/)
  .filter((w) => w.length > 0).length;
