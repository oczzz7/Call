# ვიყენებთ Node.js-ის მსუბუქ ვერსიას
FROM node:20-alpine

# ვქმნით სამუშაო დირექტორიას კონტეინერში
WORKDIR /app

# ვაკოპირებთ package.json-ს და ვაყენებთ მოდულებს
COPY package*.json ./
RUN npm install

# ვაკოპირებთ პროექტის დანარჩენ ფაილებს
COPY . .

# ვხსნით 3000 პორტს
EXPOSE 3000

# ვრთავთ სერვერს
CMD ["node", "server.js"]